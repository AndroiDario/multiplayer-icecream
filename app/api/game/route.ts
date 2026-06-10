import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  marketSnapshots,
  players,
  quarterDecisions,
  quarterResults,
  researchPurchases,
  roomCreationLimits,
  rooms,
} from "@/db/schema";
import {
  buildMarketSnapshot,
  defaultDecision,
  districts,
  evaluateQuarter,
  firstQuarterOfYear,
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
  type DistrictKey,
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
  autoSubmit?: boolean;
  decision?: Partial<QuarterDecisionInput>;
};

type RoomRow = typeof rooms.$inferSelect;
type PlayerDbRow = typeof players.$inferSelect;
type DecisionRow = typeof quarterDecisions.$inferSelect;
type ResultRow = typeof quarterResults.$inferSelect;

const TURN_DURATION_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 20 * 1024;
const MAX_ROOM_CREATES_PER_HOUR = 8;
const MAX_ROOM_CREATES_PER_DAY = 40;
const ROOM_TTL_DAYS = 14;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 25;
const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

let lastCleanupAt = 0;

function json(data: unknown, status = 200) {
  return Response.json(data, { headers: SECURITY_HEADERS, status });
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
    const url = new URL(request.url);
    const roomCode = normalizeCode(url.searchParams.get("roomCode") ?? undefined);

    if (!roomCode) {
      return json({ error: "Serve il codice della stanza." }, 400);
    }

    if (url.searchParams.has("playerToken") || url.searchParams.has("hostToken")) {
      return json(
        { error: "Per sicurezza i token non si inviano piu nell'URL." },
        400
      );
    }

    return json(await getRoomState(roomCode));
  } catch (error) {
    return json({ error: routeError(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readActionPayload(request);

    if (payload.action === "getState") {
      return json(
        await getRoomState(payload.roomCode, payload.playerToken, payload.hostToken)
      );
    }

    if (payload.action === "createRoom") {
      const quota = await enforceRoomCreationLimit(request);
      if (quota.error) {
        return json({ error: quota.error }, 429);
      }

      await cleanupExpiredRooms();
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
          payload.decision ?? {},
          Boolean(payload.autoSubmit)
        )
      );
    }

    if (payload.action === "advanceQuarter") {
      return json(await advanceQuarter(payload.roomCode, payload.hostToken));
    }

    return json({ error: "Azione non riconosciuta." }, 400);
  } catch (error) {
    if (error instanceof PayloadError) {
      return json({ error: error.message }, error.status);
    }

    return json({ error: routeError(error) }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: { ...SECURITY_HEADERS, Allow: "GET, POST, OPTIONS" },
    status: 204,
  });
}

export async function DELETE() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

function methodNotAllowed() {
  return json({ error: "Metodo non consentito." }, 405);
}

class PayloadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function readActionPayload(request: Request): Promise<ActionPayload> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PayloadError("La richiesta e troppo grande.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new PayloadError("La richiesta e troppo grande.", 413);
  }

  if (!text.trim()) {
    throw new PayloadError("Richiesta JSON mancante.", 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PayloadError("JSON non valido.", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PayloadError("Richiesta non valida.", 400);
  }

  return parsed as ActionPayload;
}

async function enforceRoomCreationLimit(request: Request) {
  const db = getDb();
  const ipHash = await clientHash(request);
  const nowDate = new Date();
  const hourStart = `${nowDate.toISOString().slice(0, 13)}:00:00.000Z`;
  const dayStart = `${nowDate.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const [existing] = await db
    .select()
    .from(roomCreationLimits)
    .where(eq(roomCreationLimits.ipHash, ipHash))
    .limit(1);

  const hourCount = existing?.hourStart === hourStart ? existing.hourCount : 0;
  const dayCount = existing?.dayStart === dayStart ? existing.dayCount : 0;

  if (hourCount >= MAX_ROOM_CREATES_PER_HOUR) {
    return {
      error:
        "Troppe stanze create da questa connessione. Riprova tra circa un'ora.",
    };
  }

  if (dayCount >= MAX_ROOM_CREATES_PER_DAY) {
    return {
      error:
        "Troppe stanze create oggi da questa connessione. Riprova domani.",
    };
  }

  const values = {
    ipHash,
    hourStart,
    hourCount: hourCount + 1,
    dayStart,
    dayCount: dayCount + 1,
    updatedAt: now(),
  };

  if (existing) {
    await db
      .update(roomCreationLimits)
      .set(values)
      .where(eq(roomCreationLimits.ipHash, ipHash));
  } else {
    await db.insert(roomCreationLimits).values(values);
  }

  return {};
}

async function clientHash(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    request.headers.get("cf-connecting-ip") ??
    forwardedFor ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function cleanupExpiredRooms() {
  const nowMs = Date.now();
  if (nowMs - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = nowMs;

  const cutoff = new Date(nowMs - ROOM_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const expiredRooms = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(lt(rooms.updatedAt, cutoff))
    .limit(CLEANUP_BATCH_SIZE);
  const roomIds = expiredRooms.map((room) => room.id);

  if (roomIds.length === 0) return;

  await db.delete(quarterResults).where(inArray(quarterResults.roomId, roomIds));
  await db.delete(quarterDecisions).where(inArray(quarterDecisions.roomId, roomIds));
  await db
    .delete(researchPurchases)
    .where(inArray(researchPurchases.roomId, roomIds));
  await db.delete(marketSnapshots).where(inArray(marketSnapshots.roomId, roomIds));
  await db.delete(players).where(inArray(players.roomId, roomIds));
  await db.delete(rooms).where(inArray(rooms.id, roomIds));
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
  payload?: Partial<QuarterDecisionInput>,
  autoSubmit = false
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
  const lockedDistrict = await lockedDistrictForPlayer(room.id, player.id, quarter);
  const validated = validateDecision(payload ?? {}, researchSpend, cash, lockedDistrict);

  if ("error" in validated) {
    return { error: validated.error };
  }

  await insertDecision(
    room.id,
    player.id,
    quarter,
    validated.decision,
    researchSpend,
    autoSubmit
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
      const fallback = defaultDecision();
      const lockedDistrict = await lockedDistrictForPlayer(room.id, player.id, quarter);
      if (lockedDistrict) {
        fallback.district = lockedDistrict;
      }
      await insertDecision(room.id, player.id, quarter, fallback, 0, true);
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
  const latestResultQuarter = latestResults[0]?.quarter ?? null;
  const latestDecisions = latestResultQuarter
    ? await db
        .select()
        .from(quarterDecisions)
        .where(
          and(
            eq(quarterDecisions.roomId, room.id),
            eq(quarterDecisions.quarter, latestResultQuarter)
          )
        )
    : [];
  const latestDecisionByPlayer = new Map(
    latestDecisions.map((decision) => [decision.playerId, decision])
  );
  const currentPlayerLatestResult = player
    ? latestResults.find((result) => result.playerId === player.id) ?? null
    : null;
  const competitorData = buildCompetitorData(
    roomPlayers,
    allDecisions,
    latestResults,
    latestDecisions
  );
  const lockedDistrict = player
    ? await lockedDistrictForPlayer(room.id, player.id, quarter)
    : null;
  const purchasedTypes = playerResearch.map((purchase) => purchase.type);
  const turnStartedAt = room.status === "active" ? room.updatedAt : null;
  const turnEndsAt = turnStartedAt
    ? new Date(new Date(turnStartedAt).getTime() + TURN_DURATION_SECONDS * 1000).toISOString()
    : null;

  return {
    room: {
      code: room.code,
      hostName: room.hostName,
      status: room.status,
      currentQuarter: room.currentQuarter,
      totalQuarters: TOTAL_QUARTERS,
      startingCash: STARTING_CASH,
      turnStartedAt,
      turnEndsAt,
      turnDurationSeconds: TURN_DURATION_SECONDS,
      serverNow: now(),
    },
    isHost,
    currentPlayer: player
      ? {
          id: player.id,
          nickname: player.nickname,
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
    lockedDistrict,
    market: publicResearchData(
      market,
      isHost ? researchOptions.map((item) => item.key) : purchasedTypes,
      competitorData
    ),
    purchasedResearch: purchasedTypes,
    researchSpend: playerResearch.reduce((sum, item) => sum + item.cost, 0),
    latestResults: latestResults.map(resultView),
    latestPublicResults: latestResults
      .map((result) => publicResultView(result, roomPlayers))
      .sort((a, b) => b.units - a.units),
    currentPlayerLatestBreakdown:
      currentPlayerLatestResult && player
        ? breakdownView(
            currentPlayerLatestResult,
            latestDecisionByPlayer.get(player.id) ?? null
          )
        : null,
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

// Location bloccata per l'anno in corso: in Q2–Q4 restituisce il quartiere
// scelto nel Q1 dello stesso anno (null in Q1, o se quel Q1 non ha decisioni —
// es. squadra entrata a metà anno: in quel caso la scelta corrente fa testo).
async function lockedDistrictForPlayer(
  roomId: string,
  playerId: string,
  quarter: number
): Promise<DistrictKey | null> {
  const quarterOfYear = ((quarter - 1) % 4) + 1;
  if (quarterOfYear === 1) return null;
  const q1Decision = await decisionForPlayer(roomId, playerId, firstQuarterOfYear(quarter));
  return (q1Decision?.district as DistrictKey | undefined) ?? null;
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

function publicResultView(result: ResultRow, roomPlayers: PlayerDbRow[]) {
  const player = roomPlayers.find((item) => item.id === result.playerId);

  return {
    playerId: result.playerId,
    nickname: player?.nickname ?? "Squadra",
    quarter: result.quarter,
    units: result.units,
    revenue: result.revenue,
    profit: result.profit,
    marketShare: result.marketShare,
    satisfaction: result.satisfaction,
  };
}

function breakdownView(result: ResultRow, decision: DecisionRow | null) {
  const drivers = JSON.parse(result.data) as Record<string, unknown>;
  const decisionInput = decision ? toDecisionInput(decision) : null;
  const price = decisionInput
    ? priceTiers.find((item) => item.key === decisionInput.priceTier)
    : null;
  const district = decisionInput
    ? districts.find((item) => item.key === decisionInput.district)
    : null;
  const unitPrice = numberFrom(
    drivers.unitPrice,
    price?.price ?? (result.units > 0 ? result.revenue / result.units : 0)
  );
  const rent = numberFrom(drivers.rent, district?.rent ?? 0);
  const adSpend = numberFrom(
    drivers.adSpend,
    decisionInput
      ? decisionInput.googleBudget +
          decisionInput.metaBudget +
          decisionInput.influencerBudget
      : 0
  );
  const researchSpend = numberFrom(drivers.researchSpend, decision?.researchSpend ?? 0);
  const fallbackProductCost = price
    ? result.units * price.price * (1 - price.margin)
    : Math.max(0, result.revenue - result.profit - rent - adSpend - researchSpend);
  const productCost = numberFrom(drivers.productCost, fallbackProductCost);
  const totalExpenses = numberFrom(
    drivers.totalExpenses,
    productCost + rent + adSpend + researchSpend
  );

  return {
    quarter: result.quarter,
    unitPrice,
    units: result.units,
    revenue: result.revenue,
    productCost,
    rent,
    adSpend,
    researchSpend,
    totalExpenses,
    profit: result.profit,
    factors: {
      productFit: numberFrom(drivers.productFit, 0),
      priceFit: numberFrom(drivers.priceFit, 0),
      traffic: numberFrom(drivers.traffic, 0),
      adLift: numberFrom(drivers.adLift, 0),
      crowding: numberFrom(drivers.crowding, 0),
      autoSubmitted: Boolean(drivers.autoSubmitted),
    },
  };
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildCompetitorData(
  roomPlayers: PlayerDbRow[],
  decisions: DecisionRow[],
  latestResults: ResultRow[],
  previousDecisions: DecisionRow[]
) {
  return roomPlayers.map((player) => {
    // Se il rivale non ha ancora inviato in questo trimestre, mostro la sua
    // posizione del trimestre precedente così il benchmark non è mai vuoto.
    const current = decisions.find((item) => item.playerId === player.id);
    const previous = previousDecisions.find((item) => item.playerId === player.id);
    const decision = current ?? previous;
    const result = latestResults.find((item) => item.playerId === player.id);
    const district = districts.find((item) => item.key === decision?.district);

    return {
      nickname: player.nickname,
      product: decision?.product ?? null,
      priceTier: decision?.priceTier ?? null,
      district: district?.label ?? null,
      districtKey: district?.key ?? null,
      revenue: result?.revenue ?? null,
      fromPreviousQuarter: !current && Boolean(previous),
    };
  });
}

function now() {
  return new Date().toISOString();
}
