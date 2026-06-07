import { and, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  marketSnapshots,
  players,
  quarterDecisions,
  quarterResults,
  researchPurchases,
  rooms,
} from "@/db/schema";
import {
  buildMarketSnapshot,
  defaultDecision,
  districts,
  evaluateQuarter,
  makeRoomCode,
  MAX_PLAYERS,
  priceTiers,
  products,
  publicResearchData,
  STARTING_CASH,
  researchCost,
  researchOptions,
  TOTAL_QUARTERS,
  validateDecision,
  type MarketSnapshot,
  type QuarterDecisionInput,
} from "@/lib/game";

export const dynamic = "force-dynamic";

type ActionPayload = {
  action?: string;
  roomCode?: string;
  hostToken?: string;
  playerToken?: string;
  instructorName?: string;
  nickname?: string;
  researchType?: string;
  decision?: Partial<QuarterDecisionInput>;
};

type RoomRow = typeof rooms.$inferSelect;
type PlayerDbRow = typeof players.$inferSelect;
type DecisionRow = typeof quarterDecisions.$inferSelect;
type ResultRow = typeof quarterResults.$inferSelect;

let schemaReady: Promise<void> | null = null;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function normalizeCode(code?: string) {
  return (code ?? "").trim().toUpperCase();
}

function cleanName(name?: string, fallback = "Instructor") {
  const cleaned = (name ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
  return cleaned || fallback;
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function seed() {
  return Math.floor(Math.random() * 900000) + 100000;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${detail}`;

  if (
    combined.includes("no such table") ||
    combined.includes('from "rooms"') ||
    combined.includes("SQLITE_ERROR")
  ) {
    return "Il database del gioco non è ancora pronto. Riprova tra qualche secondo.";
  }

  return message;
}

export async function GET(request: Request) {
  try {
    await ensureGameSchema();
    const url = new URL(request.url);
    const roomCode = normalizeCode(url.searchParams.get("roomCode") ?? undefined);
    const playerToken = url.searchParams.get("playerToken") ?? undefined;
    const hostToken = url.searchParams.get("hostToken") ?? undefined;

    if (!roomCode) {
      return json({ error: "Serve il codice della stanza." }, 400);
    }

    return json(await getRoomState(roomCode, playerToken, hostToken));
  } catch (error) {
    return json({ error: routeError(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureGameSchema();
    const payload = (await request.json()) as ActionPayload;

    if (payload.action === "createRoom") {
      return json(await createRoom(payload.instructorName));
    }

    if (payload.action === "joinRoom") {
      return json(await joinRoom(payload.roomCode, payload.nickname));
    }

    if (payload.action === "purchaseResearch") {
      return json(
        await purchaseResearch(
          payload.roomCode,
          payload.playerToken,
          payload.researchType
        )
      );
    }

    if (payload.action === "submitDecision") {
      return json(
        await submitDecision(
          payload.roomCode,
          payload.playerToken,
          payload.decision ?? {}
        )
      );
    }

    if (payload.action === "advanceQuarter") {
      return json(await advanceQuarter(payload.roomCode, payload.hostToken));
    }

    return json({ error: "Azione non riconosciuta." }, 400);
  } catch (error) {
    return json({ error: routeError(error) }, 500);
  }
}

async function ensureGameSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS rooms (
          id text PRIMARY KEY NOT NULL,
          code text NOT NULL UNIQUE,
          host_name text NOT NULL,
          host_token text NOT NULL,
          seed integer NOT NULL,
          status text DEFAULT 'lobby' NOT NULL,
          current_quarter integer DEFAULT 0 NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS rooms_code_idx ON rooms (code)`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS players (
          id text PRIMARY KEY NOT NULL,
          room_id text NOT NULL REFERENCES rooms(id),
          nickname text NOT NULL,
          token text NOT NULL UNIQUE,
          cumulative_revenue real DEFAULT 0 NOT NULL,
          cumulative_profit real DEFAULT 0 NOT NULL,
          cumulative_satisfaction real DEFAULT 0 NOT NULL,
          joined_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS players_room_idx ON players (room_id)`),
        d1.prepare(`CREATE INDEX IF NOT EXISTS players_token_idx ON players (token)`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS market_snapshots (
          id text PRIMARY KEY NOT NULL,
          room_id text NOT NULL REFERENCES rooms(id),
          quarter integer NOT NULL,
          data text NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS market_room_quarter_idx ON market_snapshots (room_id, quarter)`
        ),
        d1.prepare(`CREATE TABLE IF NOT EXISTS research_purchases (
          id text PRIMARY KEY NOT NULL,
          room_id text NOT NULL REFERENCES rooms(id),
          player_id text NOT NULL REFERENCES players(id),
          quarter integer NOT NULL,
          type text NOT NULL,
          cost integer NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS research_player_quarter_idx ON research_purchases (player_id, quarter)`
        ),
        d1.prepare(`CREATE TABLE IF NOT EXISTS quarter_decisions (
          id text PRIMARY KEY NOT NULL,
          room_id text NOT NULL REFERENCES rooms(id),
          player_id text NOT NULL REFERENCES players(id),
          quarter integer NOT NULL,
          product text NOT NULL,
          price_tier text NOT NULL,
          district text NOT NULL,
          google_budget integer NOT NULL,
          meta_budget integer NOT NULL,
          influencer_budget integer NOT NULL,
          research_spend integer NOT NULL,
          auto_submitted integer DEFAULT false NOT NULL,
          submitted_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS decisions_room_quarter_idx ON quarter_decisions (room_id, quarter)`
        ),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS decisions_player_quarter_idx ON quarter_decisions (player_id, quarter)`
        ),
        d1.prepare(`CREATE TABLE IF NOT EXISTS quarter_results (
          id text PRIMARY KEY NOT NULL,
          room_id text NOT NULL REFERENCES rooms(id),
          player_id text NOT NULL REFERENCES players(id),
          quarter integer NOT NULL,
          revenue real NOT NULL,
          profit real NOT NULL,
          units integer NOT NULL,
          market_share real NOT NULL,
          satisfaction real NOT NULL,
          data text NOT NULL,
          created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS results_room_quarter_idx ON quarter_results (room_id, quarter)`
        ),
        d1.prepare(
          `CREATE INDEX IF NOT EXISTS results_player_quarter_idx ON quarter_results (player_id, quarter)`
        ),
      ])
      .then(() => undefined);
  }

  return schemaReady;
}

async function createRoom(instructorName?: string) {
  const db = getDb();
  let roomSeed = seed();
  let code = makeRoomCode(roomSeed);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.code, code))
      .limit(1);

    if (!existing[0]) break;
    roomSeed = seed();
    code = makeRoomCode(roomSeed + attempt);
  }

  const roomId = id("room");
  const hostToken = id("host");

  await db.insert(rooms).values({
    id: roomId,
    code,
    hostName: cleanName(instructorName),
    hostToken,
    seed: roomSeed,
  });

  return {
    roomCode: code,
    hostToken,
    state: await getRoomState(code, undefined, hostToken),
  };
}

async function joinRoom(roomCode?: string, nickname?: string) {
  const db = getDb();
  const room = await requireRoom(roomCode);
  const count = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.roomId, room.id));

  if (count.length >= MAX_PLAYERS) {
    return { error: "Questa stanza ha già 10 squadre." };
  }

  if (room.status !== "lobby") {
    return { error: "La partita in questa stanza è già iniziata." };
  }

  const playerToken = id("player");

  await db.insert(players).values({
    id: id("p"),
    roomId: room.id,
    nickname: cleanName(nickname, "Player"),
    token: playerToken,
  });

  return {
    roomCode: room.code,
    playerToken,
    state: await getRoomState(room.code, playerToken),
  };
}

async function purchaseResearch(
  roomCode?: string,
  playerToken?: string,
  researchType?: string
) {
  const db = getDb();
  const room = await requireRoom(roomCode);
  const player = await requirePlayer(room.id, playerToken);
  const quarter = room.currentQuarter;
  const cost = researchCost(researchType ?? "");

  if (room.status !== "active" || quarter < 1 || quarter > TOTAL_QUARTERS) {
    return { error: "Le ricerche si comprano solo durante un trimestre attivo." };
  }

  if (cost === null || !researchOptions.some((item) => item.key === researchType)) {
    return { error: "Scegli una ricerca valida." };
  }

  const submitted = await decisionForPlayer(room.id, player.id, quarter);
  if (submitted) {
    return { error: "Questa squadra ha già inviato le scelte per il trimestre." };
  }

  const purchases = await researchForPlayer(room.id, player.id, quarter);
  if (purchases.some((purchase) => purchase.type === researchType)) {
    return { state: await getRoomState(room.code, playerToken) };
  }

  const spent = purchases.reduce((sum, purchase) => sum + purchase.cost, 0);
  const cash = STARTING_CASH + player.cumulativeProfit;
  if (spent + cost > cash) {
    return { error: "La spesa in ricerche supera la cassa disponibile." };
  }

  await db.insert(researchPurchases).values({
    id: id("research"),
    roomId: room.id,
    playerId: player.id,
    quarter,
    type: researchType!,
    cost,
  });

  return { state: await getRoomState(room.code, playerToken) };
}

async function submitDecision(
  roomCode?: string,
  playerToken?: string,
  payload?: Partial<QuarterDecisionInput>
) {
  const room = await requireRoom(roomCode);
  const player = await requirePlayer(room.id, playerToken);
  const quarter = room.currentQuarter;

  if (room.status !== "active" || quarter < 1 || quarter > TOTAL_QUARTERS) {
    return { error: "Le scelte si inviano solo durante un trimestre attivo." };
  }

  const existing = await decisionForPlayer(room.id, player.id, quarter);
  if (existing) {
    return { error: "Questa squadra ha già inviato le scelte per il trimestre." };
  }

  const researchSpend = (await researchForPlayer(room.id, player.id, quarter)).reduce(
    (sum, purchase) => sum + purchase.cost,
    0
  );
  const cash = STARTING_CASH + player.cumulativeProfit;
  const validated = validateDecision(payload ?? {}, researchSpend, cash);

  if ("error" in validated) {
    return { error: validated.error };
  }

  await insertDecision(
    room.id,
    player.id,
    quarter,
    validated.decision,
    researchSpend,
    false
  );

  return { state: await getRoomState(room.code, playerToken) };
}

async function advanceQuarter(roomCode?: string, hostToken?: string) {
  const db = getDb();
  const room = await requireRoom(roomCode);

  if (room.hostToken !== hostToken) {
    return { error: "Solo il professore può far avanzare la partita." };
  }

  if (room.status === "complete") {
    return { state: await getRoomState(room.code, undefined, hostToken) };
  }

  if (room.status === "lobby") {
    const roomPlayers = await getRoomPlayers(room.id);
    if (roomPlayers.length < 1) {
      return { error: "Aggiungi almeno una squadra prima di iniziare." };
    }

    await ensureMarketSnapshot(room, 1);
    await db
      .update(rooms)
      .set({ status: "active", currentQuarter: 1, updatedAt: now() })
      .where(eq(rooms.id, room.id));
    return { state: await getRoomState(room.code, undefined, hostToken) };
  }

  const quarter = room.currentQuarter;
  if (quarter < 1 || quarter > TOTAL_QUARTERS) {
    return { error: "Questa stanza non è in un trimestre attivo." };
  }

  const existingResults = await db
    .select()
    .from(quarterResults)
    .where(and(eq(quarterResults.roomId, room.id), eq(quarterResults.quarter, quarter)))
    .limit(1);

  if (!existingResults[0]) {
    await computeQuarter(room, quarter);
  }

  const nextQuarter = quarter + 1;
  const status = nextQuarter > TOTAL_QUARTERS ? "complete" : "active";

  if (status === "active") {
    await ensureMarketSnapshot(room, nextQuarter);
  }

  await db
    .update(rooms)
    .set({
      status,
      currentQuarter: status === "complete" ? TOTAL_QUARTERS : nextQuarter,
      updatedAt: now(),
    })
    .where(eq(rooms.id, room.id));

  return { state: await getRoomState(room.code, undefined, hostToken) };
}

async function computeQuarter(room: RoomRow, quarter: number) {
  const db = getDb();
  const roomPlayers = await getRoomPlayers(room.id);
  const existingDecisions = await db
    .select()
    .from(quarterDecisions)
    .where(and(eq(quarterDecisions.roomId, room.id), eq(quarterDecisions.quarter, quarter)));
  const byPlayer = new Map(existingDecisions.map((decision) => [decision.playerId, decision]));

  for (const player of roomPlayers) {
    if (!byPlayer.has(player.id)) {
      await insertDecision(room.id, player.id, quarter, defaultDecision(), 0, true);
    }
  }

  const decisions = await db
    .select()
    .from(quarterDecisions)
    .where(and(eq(quarterDecisions.roomId, room.id), eq(quarterDecisions.quarter, quarter)));
  const decisionInputs = decisions.map(toDecisionInput);
  const market = await ensureMarketSnapshot(room, quarter);
  const evaluated = decisions.map((decision) => {
    const player = roomPlayers.find((item) => item.id === decision.playerId)!;
    const result = evaluateQuarter(
      player,
      toDecisionInput(decision),
      market,
      decisionInputs,
      decision.researchSpend
    );
    return {
      decision,
      result: {
        ...result,
        drivers: {
          ...result.drivers,
          autoSubmitted: decision.autoSubmitted,
        },
      },
    };
  });
  const totalUnits = evaluated.reduce((sum, item) => sum + item.result.units, 0) || 1;

  for (const item of evaluated) {
    const marketShare = item.result.units / totalUnits;

    await db.insert(quarterResults).values({
      id: id("result"),
      roomId: room.id,
      playerId: item.decision.playerId,
      quarter,
      revenue: item.result.revenue,
      profit: item.result.profit,
      units: item.result.units,
      marketShare,
      satisfaction: item.result.satisfaction,
      data: JSON.stringify(item.result.drivers),
    });

    const player = roomPlayers.find((row) => row.id === item.decision.playerId)!;
    await db
      .update(players)
      .set({
        cumulativeRevenue: player.cumulativeRevenue + item.result.revenue,
        cumulativeProfit: player.cumulativeProfit + item.result.profit,
        cumulativeSatisfaction:
          player.cumulativeSatisfaction + item.result.satisfaction,
      })
      .where(eq(players.id, item.decision.playerId));
  }
}

async function getRoomState(
  roomCode?: string,
  playerToken?: string,
  hostToken?: string
) {
  const db = getDb();
  const room = await requireRoom(roomCode);
  const isHost = Boolean(hostToken && hostToken === room.hostToken);
  const roomPlayers = await getRoomPlayers(room.id);
  const player =
    playerToken === undefined ? null : await optionalPlayer(room.id, playerToken);
  const quarter = room.currentQuarter || 1;
  const market = await ensureMarketSnapshot(room, quarter);
  const allDecisions = await db
    .select()
    .from(quarterDecisions)
    .where(and(eq(quarterDecisions.roomId, room.id), eq(quarterDecisions.quarter, quarter)));
  const submittedPlayerIds = allDecisions.map((decision) => decision.playerId);
  const playerDecision = player
    ? allDecisions.find((decision) => decision.playerId === player.id) ?? null
    : null;
  const playerResearch =
    player && room.status === "active"
      ? await researchForPlayer(room.id, player.id, quarter)
      : [];
  const latestResults = await db
    .select()
    .from(quarterResults)
    .where(
      and(
        eq(quarterResults.roomId, room.id),
        eq(
          quarterResults.quarter,
          room.status === "complete" ? TOTAL_QUARTERS : Math.max(1, room.currentQuarter - 1)
        )
      )
    )
    .orderBy(desc(quarterResults.revenue));
  const allResults = await db
    .select()
    .from(quarterResults)
    .where(eq(quarterResults.roomId, room.id))
    .orderBy(desc(quarterResults.quarter), desc(quarterResults.revenue));
  const competitorData = buildCompetitorData(
    roomPlayers,
    allDecisions,
    latestResults
  );
  const purchasedTypes = playerResearch.map((purchase) => purchase.type);

  return {
    room: {
      code: room.code,
      hostName: room.hostName,
      status: room.status,
      currentQuarter: room.currentQuarter,
      totalQuarters: TOTAL_QUARTERS,
      startingCash: STARTING_CASH,
    },
    isHost,
    currentPlayer: player
      ? {
          id: player.id,
          nickname: player.nickname,
          token: player.token,
          cash: STARTING_CASH + player.cumulativeProfit,
        }
      : null,
    players: roomPlayers.map((item) => ({
      id: item.id,
      nickname: item.nickname,
      cash: STARTING_CASH + item.cumulativeProfit,
      cumulativeRevenue: item.cumulativeRevenue,
      cumulativeProfit: item.cumulativeProfit,
      averageSatisfaction:
        room.currentQuarter > 1
          ? item.cumulativeSatisfaction / Math.max(1, room.currentQuarter - 1)
          : 0,
    })),
    leaderboard: roomPlayers
      .map((item) => ({
        id: item.id,
        nickname: item.nickname,
        cash: STARTING_CASH + item.cumulativeProfit,
        cumulativeRevenue: item.cumulativeRevenue,
        cumulativeProfit: item.cumulativeProfit,
      }))
      .sort((a, b) => b.cash - a.cash),
    submittedPlayerIds,
    submittedCount: submittedPlayerIds.length,
    playerDecision,
    market: publicResearchData(
      market,
      isHost ? researchOptions.map((item) => item.key) : purchasedTypes,
      competitorData
    ),
    purchasedResearch: purchasedTypes,
    researchSpend: playerResearch.reduce((sum, item) => sum + item.cost, 0),
    latestResults: latestResults.map(resultView),
    allResults: allResults.map(resultView),
    options: {
      products,
      priceTiers,
      districts,
      researchOptions,
    },
  };
}

async function requireRoom(roomCode?: string) {
  const db = getDb();
  const code = normalizeCode(roomCode);

  if (!code) {
    throw new Error("Serve il codice della stanza.");
  }

  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, code))
    .limit(1);

  if (!room) {
    throw new Error("Stanza non trovata.");
  }

  return room;
}

async function requirePlayer(roomId: string, token?: string) {
  const player = await optionalPlayer(roomId, token);

  if (!player) {
    throw new Error("Identificativo della squadra non valido.");
  }

  return player;
}

async function optionalPlayer(roomId: string, token?: string) {
  if (!token) return null;
  const db = getDb();
  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.roomId, roomId), eq(players.token, token)))
    .limit(1);
  return player ?? null;
}

async function getRoomPlayers(roomId: string) {
  return getDb()
    .select()
    .from(players)
    .where(eq(players.roomId, roomId));
}

async function decisionForPlayer(roomId: string, playerId: string, quarter: number) {
  const [decision] = await getDb()
    .select()
    .from(quarterDecisions)
    .where(
      and(
        eq(quarterDecisions.roomId, roomId),
        eq(quarterDecisions.playerId, playerId),
        eq(quarterDecisions.quarter, quarter)
      )
    )
    .limit(1);
  return decision ?? null;
}

async function researchForPlayer(roomId: string, playerId: string, quarter: number) {
  return getDb()
    .select()
    .from(researchPurchases)
    .where(
      and(
        eq(researchPurchases.roomId, roomId),
        eq(researchPurchases.playerId, playerId),
        eq(researchPurchases.quarter, quarter)
      )
    );
}

async function ensureMarketSnapshot(room: RoomRow, quarter: number) {
  const db = getDb();
  const snapshotId = `${room.id}-${quarter}`;
  const [existing] = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.id, snapshotId))
    .limit(1);

  if (existing) {
    return JSON.parse(existing.data) as MarketSnapshot;
  }

  const snapshot = buildMarketSnapshot(room.seed, quarter);
  await db.insert(marketSnapshots).values({
    id: snapshotId,
    roomId: room.id,
    quarter,
    data: JSON.stringify(snapshot),
  });

  return snapshot;
}

async function insertDecision(
  roomId: string,
  playerId: string,
  quarter: number,
  decision: QuarterDecisionInput,
  researchSpend: number,
  autoSubmitted: boolean
) {
  await getDb().insert(quarterDecisions).values({
    id: id("decision"),
    roomId,
    playerId,
    quarter,
    product: decision.product,
    priceTier: decision.priceTier,
    district: decision.district,
    googleBudget: decision.googleBudget,
    metaBudget: decision.metaBudget,
    influencerBudget: decision.influencerBudget,
    researchSpend,
    autoSubmitted,
  });
}

function toDecisionInput(decision: DecisionRow): QuarterDecisionInput {
  return {
    product: decision.product as QuarterDecisionInput["product"],
    priceTier: decision.priceTier as QuarterDecisionInput["priceTier"],
    district: decision.district as QuarterDecisionInput["district"],
    googleBudget: decision.googleBudget,
    metaBudget: decision.metaBudget,
    influencerBudget: decision.influencerBudget,
  };
}

function resultView(result: ResultRow) {
  return {
    id: result.id,
    playerId: result.playerId,
    quarter: result.quarter,
    revenue: result.revenue,
    profit: result.profit,
    units: result.units,
    marketShare: result.marketShare,
    satisfaction: result.satisfaction,
    drivers: JSON.parse(result.data) as Record<string, unknown>,
  };
}

function buildCompetitorData(
  roomPlayers: PlayerDbRow[],
  decisions: DecisionRow[],
  latestResults: ResultRow[]
) {
  return roomPlayers.map((player) => {
    const decision = decisions.find((item) => item.playerId === player.id);
    const result = latestResults.find((item) => item.playerId === player.id);

    return {
      nickname: player.nickname,
      product: decision?.product ?? null,
      priceTier: decision?.priceTier ?? null,
      district:
        districts.find((district) => district.key === decision?.district)?.label ??
        null,
      revenue: result?.revenue ?? null,
    };
  });
}

function now() {
  return new Date().toISOString();
}
