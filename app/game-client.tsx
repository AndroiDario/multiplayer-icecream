"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  firstQuarterOfYear,
  projectQuarter,
  type QuarterDecisionInput,
} from "@/lib/game";

type ApiState = {
  room: {
    code: string;
    hostName: string;
    status: "lobby" | "active" | "complete";
    currentQuarter: number;
    totalQuarters: number;
    startingCash: number;
    turnStartedAt: string | null;
    turnEndsAt: string | null;
    turnDurationSeconds: number;
    serverNow: string;
  };
  isHost: boolean;
  currentPlayer: null | { id: string; nickname: string; cash: number };
  players: Array<{
    id: string;
    nickname: string;
    cash: number;
    cumulativeRevenue: number;
    cumulativeProfit: number;
    averageSatisfaction: number;
  }>;
  leaderboard: Array<{
    id: string;
    nickname: string;
    cash: number;
    cumulativeRevenue: number;
    cumulativeProfit: number;
  }>;
  submittedPlayerIds: string[];
  submittedCount: number;
  playerDecision: null | Record<string, unknown>;
  lockedDistrict: string | null;
  market: {
    baseline: {
      quarter: number;
      year: number;
      quarterOfYear: number;
      season: string;
      seasonNote: string;
      event: string;
      eventNote: string;
      baseDemand: number;
    };
    traffic:
      | null
      | Array<{
          key: string;
          label: string;
          x: number;
          y: number;
          traffic: number;
          rent: number;
          mix: Record<string, number>;
        }>;
    segments: null | {
      productFit: Record<string, Record<string, number>>;
      segmentPriceTolerance: Record<string, number>;
    };
    channels: null | { google: number; meta: number; influencer: number };
    competitors:
      | null
      | Array<{
          nickname: string;
          product?: string | null;
          priceTier?: string | null;
          district?: string | null;
          districtKey?: string | null;
          revenue?: number | null;
          fromPreviousQuarter?: boolean;
        }>;
  };
  purchasedResearch: string[];
  researchSpend: number;
  latestResults: Array<{
    playerId: string;
    quarter: number;
    revenue: number;
    profit: number;
    units: number;
    marketShare: number;
    satisfaction: number;
    drivers: Record<string, unknown>;
  }>;
  latestPublicResults: Array<{
    playerId: string;
    nickname: string;
    quarter: number;
    units: number;
    revenue: number;
    profit: number;
    marketShare: number;
    satisfaction: number;
  }>;
  currentPlayerLatestBreakdown: null | {
    quarter: number;
    unitPrice: number;
    units: number;
    revenue: number;
    productCost: number;
    rent: number;
    adSpend: number;
    researchSpend: number;
    totalExpenses: number;
    profit: number;
    factors: {
      productFit: number;
      priceFit: number;
      traffic: number;
      adLift: number;
      crowding: number;
      autoSubmitted: boolean;
    };
  };
  allResults: Array<{
    playerId: string;
    quarter: number;
    revenue: number;
    profit: number;
    units: number;
    marketShare: number;
    satisfaction: number;
    drivers: Record<string, unknown>;
  }>;
  options: {
    products: Array<{ key: string; label: string; description: string }>;
    priceTiers: Array<{ key: string; label: string; price: number; margin: number }>;
    districts: Array<{
      key: string;
      label: string;
      x: number;
      y: number;
      traffic: number;
      rent: number;
      mix: Record<string, number>;
    }>;
    researchOptions: Array<{
      key: string;
      label: string;
      cost: number;
      description: string;
    }>;
  };
};

type Decision = {
  product: string;
  priceTier: string;
  district: string;
  googleBudget: number;
  metaBudget: number;
  influencerBudget: number;
};

const starterDecision: Decision = {
  product: "classic",
  priceTier: "standard",
  district: "park",
  googleBudget: 2400,
  metaBudget: 1800,
  influencerBudget: 1200,
};

// Etichette in italiano per i dati che arrivano dal motore (lib/game.ts resta in inglese).
const PRODUCT_LABELS: Record<string, string> = {
  classic: "Classico",
  premium: "Premium",
  novelty: "Novità",
  healthy: "Salutare",
};
const PRICE_LABELS: Record<string, string> = {
  low: "Economico",
  standard: "Standard",
  premium: "Premium",
  luxury: "Lusso",
};
const DISTRICT_LABELS: Record<string, string> = {
  downtown: "Centro",
  campus: "Campus universitario",
  park: "Parco sul fiume",
  station: "Stazione",
  oldtown: "Città vecchia",
};
const RESEARCH_LABELS: Record<string, string> = {
  traffic: "Mappa traffico per quartiere",
  segments: "Preferenze dei segmenti",
  channels: "Previsione sui canali",
  competitors: "Benchmark concorrenti",
};
const SEGMENT_LABELS: Record<string, string> = {
  families: "Famiglie",
  professionals: "Professionisti",
  tourists: "Turisti",
  students: "Studenti",
};
const SEASON_IT: Record<string, string> = {
  Spring: "Primavera",
  Summer: "Estate",
  Autumn: "Autunno",
  Winter: "Inverno",
};
const SEASON_NOTE_IT: Record<string, string> = {
  Spring: "il clima mite aumenta le visite a parco e campus",
  Summer: "turisti e traffico all'aperto al massimo",
  Autumn: "gli studenti tornano ma il traffico per svago cala",
  Winter: "il freddo riduce gli acquisti d'impulso",
};
const EVENT_IT: Record<string, { name: string; note: string }> = {
  Heatwave: {
    name: "Ondata di caldo",
    note: "Le alte temperature premiano buona disponibilità e ampia copertura.",
  },
  "Rainy Month": {
    name: "Mese piovoso",
    note: "Il maltempo sposta la domanda verso i pendolari e la ricerca online.",
  },
  "City Festival": {
    name: "Festival cittadino",
    note: "I turisti affollano il centro storico e rispondono alla scoperta sui social.",
  },
  "Inflation Pressure": {
    name: "Pressione inflazionistica",
    note: "I clienti diventano sensibili al prezzo: le offerte economiche piacciono di più.",
  },
  "Tourism Spike": {
    name: "Picco di turismo",
    note: "Il flusso di visitatori rende più attraente il posizionamento premium e di novità.",
  },
  "Social Trend": {
    name: "Trend sui social",
    note: "I contenuti virali sui gusti aumentano la resa di Meta e Influencer.",
  },
};

const CASH_CHART_COLORS = [
  "#d95d67",
  "#4f9d72",
  "#4f7ea8",
  "#c28a16",
  "#8f63b8",
  "#e8853f",
  "#2f9c95",
  "#b84f8a",
  "#6f7f2a",
  "#4b5ca8",
];

type CashHistoryPoint = {
  quarter: number;
  cash: number;
};

type CashHistorySeries = {
  playerId: string;
  nickname: string;
  color: string;
  points: CashHistoryPoint[];
};

function productLabel(key: string, fallback: string) {
  return PRODUCT_LABELS[key] ?? fallback;
}
function priceLabel(key: string, fallback: string) {
  return PRICE_LABELS[key] ?? fallback;
}
function districtLabel(key: string, fallback: string) {
  return DISTRICT_LABELS[key] ?? fallback;
}
function researchLabel(key: string, fallback: string) {
  return RESEARCH_LABELS[key] ?? fallback;
}
function quarterLabel(quarter: number) {
  const q = Math.max(1, quarter);
  return `Anno ${Math.ceil(q / 4)} · Q${((q - 1) % 4) + 1}`;
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function draftStorageKey(roomCode: string, playerToken: string, quarter: number) {
  return `ice-decision-draft:${roomCode}:${playerToken}:${quarter}`;
}

function openCookiePreferences() {
  window.dispatchEvent(new Event("icecreamempire:open-cookie-preferences"));
}

function isDecision(value: unknown): value is Decision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.product === "string" &&
    typeof candidate.priceTier === "string" &&
    typeof candidate.district === "string" &&
    typeof candidate.googleBudget === "number" &&
    typeof candidate.metaBudget === "number" &&
    typeof candidate.influencerBudget === "number"
  );
}

function scaleDecisionForCash(
  decision: Decision,
  availableCash: number,
  researchSpend: number
) {
  const allowedAdSpend = Math.max(0, Math.floor(availableCash - researchSpend));
  const currentAdSpend =
    decision.googleBudget + decision.metaBudget + decision.influencerBudget;

  if (currentAdSpend <= allowedAdSpend) {
    return decision;
  }

  if (currentAdSpend <= 0 || allowedAdSpend <= 0) {
    return {
      ...decision,
      googleBudget: 0,
      metaBudget: 0,
      influencerBudget: 0,
    };
  }

  const ratio = allowedAdSpend / currentAdSpend;
  const googleBudget = Math.floor((decision.googleBudget * ratio) / 100) * 100;
  const metaBudget = Math.floor((decision.metaBudget * ratio) / 100) * 100;
  const influencerBudget = Math.max(
    0,
    allowedAdSpend - googleBudget - metaBudget
  );

  return {
    ...decision,
    googleBudget,
    metaBudget,
    influencerBudget,
  };
}

function buildCashHistory(state: ApiState): CashHistorySeries[] {
  const colorByPlayerId = new Map(
    [...state.players]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((player, index) => [
        player.id,
        CASH_CHART_COLORS[index % CASH_CHART_COLORS.length],
      ])
  );

  return state.leaderboard.map((player, index) => {
    const results = state.allResults
      .filter((result) => result.playerId === player.id)
      .sort((a, b) => a.quarter - b.quarter);
    let cash = state.room.startingCash;
    const points: CashHistoryPoint[] = [{ quarter: 0, cash }];

    for (const result of results) {
      cash += result.profit;
      points.push({ quarter: result.quarter, cash });
    }

    return {
      playerId: player.id,
      nickname: player.nickname,
      color:
        colorByPlayerId.get(player.id) ??
        CASH_CHART_COLORS[index % CASH_CHART_COLORS.length],
      points,
    };
  });
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return emptySession();
  }

  const roomCode = localStorage.getItem("ice-room-code") ?? "";
  const hostToken = localStorage.getItem("ice-host-token") ?? "";
  const playerToken = localStorage.getItem("ice-player-token") ?? "";
  const storedMode = localStorage.getItem("ice-mode");
  const mode =
    storedMode === "player" || storedMode === "instructor"
      ? storedMode
      : "instructor";

  return { mode, roomCode, hostToken, playerToken };
}

function emptySession() {
  return {
    mode: "instructor" as const,
    roomCode: "",
    hostToken: "",
    playerToken: "",
  };
}

export default function GameClient() {
  const [initialSession] = useState(emptySession);
  const [showSplash, setShowSplash] = useState(true);
  const [mode, setMode] = useState<"instructor" | "player">(
    initialSession.mode
  );
  const [instructorName, setInstructorName] = useState("Professore");
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState(initialSession.roomCode);
  const [roomCode, setRoomCode] = useState(initialSession.roomCode);
  const [hostToken, setHostToken] = useState(initialSession.hostToken);
  const [playerToken, setPlayerToken] = useState(initialSession.playerToken);
  const [state, setState] = useState<ApiState | null>(null);
  const [decision, setDecision] = useState<Decision>(starterDecision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [serverClockBase, setServerClockBase] = useState<{
    serverNowMs: number;
    receivedAtMs: number;
  } | null>(null);
  const restoredDraftKeyRef = useRef("");
  const skipDraftSaveKeyRef = useRef("");
  const autoSubmitKeyRef = useRef("");
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const storedSession = readStoredSession();
      setMode(storedSession.mode);
      setJoinCode(storedSession.roomCode);
      setRoomCode(storedSession.roomCode);
      setHostToken(storedSession.hostToken);
      setPlayerToken(storedSession.playerToken);
      setShowSplash(!storedSession.roomCode);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  const loadState = useCallback(async () => {
    if (!roomCode) return;
    const payload: Record<string, unknown> = { action: "getState", roomCode };
    if (mode === "instructor" && hostToken) payload.hostToken = hostToken;
    if (mode === "player" && playerToken) payload.playerToken = playerToken;
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setState(data);
    const serverNow = Date.parse(data.room.serverNow);
    if (Number.isFinite(serverNow)) {
      setServerClockBase({ serverNowMs: serverNow, receivedAtMs: Date.now() });
    }
  }, [hostToken, mode, playerToken, roomCode]);

  const pollIntervalMs = state?.room.status === "active" ? 5000 : 9000;

  useEffect(() => {
    if (!roomCode) return undefined;
    const poll = () => {
      if (document.visibilityState !== "hidden") {
        void loadState();
      }
    };
    const firstPoll = window.setTimeout(poll, 0);
    const interval = window.setInterval(poll, pollIntervalMs);
    const resumePoll = () => {
      if (document.visibilityState === "visible") {
        void loadState();
      }
    };
    document.addEventListener("visibilitychange", resumePoll);
    return () => {
      window.clearTimeout(firstPoll);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resumePoll);
    };
  }, [loadState, pollIntervalMs, roomCode]);

  const api = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
        return data;
      }
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setJoinCode(data.roomCode);
        localStorage.setItem("ice-room-code", data.roomCode);
      }
      if (data.hostToken) {
        setHostToken(data.hostToken);
        localStorage.setItem("ice-host-token", data.hostToken);
        localStorage.setItem("ice-mode", "instructor");
      }
      if (data.playerToken) {
        setPlayerToken(data.playerToken);
        localStorage.setItem("ice-player-token", data.playerToken);
        localStorage.setItem("ice-mode", "player");
      }
      if (data.state) {
        setState(data.state);
        const serverNow = Date.parse(data.state.room.serverNow);
        if (Number.isFinite(serverNow)) {
          setServerClockBase({
            serverNowMs: serverNow,
            receivedAtMs: Date.now(),
          });
        }
      }
      return data;
    } finally {
      setBusy(false);
    }
  }, []);

  const currentPlayerResult = useMemo(() => {
    if (!state?.currentPlayer) return null;
    return state.latestResults.find(
      (result) => result.playerId === state.currentPlayer?.id
    );
  }, [state]);

  // In Q2–Q4 la location è bloccata sulla scelta di inizio anno. Invece di
  // mutare lo stato locale (causerebbe render a cascata), derivo una decisione
  // "effettiva" con il quartiere bloccato, usata per UI, previsione e invio.
  const lockedDistrict = state?.lockedDistrict ?? null;
  const effectiveDecision: Decision = useMemo(
    () =>
      lockedDistrict && decision.district !== lockedDistrict
        ? { ...decision, district: lockedDistrict }
        : decision,
    [lockedDistrict, decision]
  );

  const adSpend =
    decision.googleBudget + decision.metaBudget + decision.influencerBudget;
  const researchSpend = state?.researchSpend ?? 0;
  const availableCash =
    state?.currentPlayer?.cash ?? state?.room.startingCash ?? 30000;
  const selectedRent =
    state?.options.districts.find((d) => d.key === effectiveDecision.district)?.rent ??
    0;
  const remainingCash = availableCash - adSpend - researchSpend;
  const projectedCash = remainingCash - selectedRent;
  const isSubmitted = Boolean(state?.playerDecision);
  const stateRoomCode = state?.room.code ?? "";
  const serverClockNow = serverClockBase
    ? serverClockBase.serverNowMs + (clockNow - serverClockBase.receivedAtMs)
    : clockNow;
  const turnEndsAtMs = state?.room.turnEndsAt
    ? Date.parse(state.room.turnEndsAt)
    : Number.NaN;
  const turnRemainingSeconds =
    state?.room.status === "active" && Number.isFinite(turnEndsAtMs)
      ? Math.max(0, Math.ceil((turnEndsAtMs - serverClockNow) / 1000))
      : null;
  const activeDraftKey =
    state?.room.status === "active" && state.currentPlayer && playerToken
      ? draftStorageKey(state.room.code, playerToken, state.room.currentQuarter)
      : "";

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeDraftKey || isSubmitted) return;
    if (restoredDraftKeyRef.current === activeDraftKey) return;

    restoredDraftKeyRef.current = activeDraftKey;
    const stored = localStorage.getItem(activeDraftKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as unknown;
      if (isDecision(parsed)) {
        skipDraftSaveKeyRef.current = activeDraftKey;
        const restoreTimer = window.setTimeout(() => setDecision(parsed), 0);
        return () => window.clearTimeout(restoreTimer);
      }
    } catch {
      localStorage.removeItem(activeDraftKey);
    }
  }, [activeDraftKey, isSubmitted]);

  useEffect(() => {
    if (!activeDraftKey) return;

    if (isSubmitted) {
      localStorage.removeItem(activeDraftKey);
      return;
    }

    if (skipDraftSaveKeyRef.current === activeDraftKey) {
      skipDraftSaveKeyRef.current = "";
      return;
    }

    localStorage.setItem(activeDraftKey, JSON.stringify(decision));
  }, [activeDraftKey, decision, isSubmitted]);

  const submitDecisionRequest = useCallback(
    async (decisionToSubmit: Decision, autoSubmit = false) => {
      if (!stateRoomCode || !playerToken || submitInFlightRef.current) return;

      submitInFlightRef.current = true;
      try {
        const data = await api({
          action: "submitDecision",
          roomCode: stateRoomCode,
          playerToken,
          autoSubmit,
          decision: decisionToSubmit,
        });

        if (!data?.error && activeDraftKey) {
          localStorage.removeItem(activeDraftKey);
        }
      } catch {
        setError("Non riesco a inviare le scelte. Controlla la connessione e riprova.");
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [activeDraftKey, api, playerToken, stateRoomCode]
  );

  useEffect(() => {
    if (
      mode !== "player" ||
      !state?.currentPlayer ||
      state.room.status !== "active" ||
      isSubmitted ||
      turnRemainingSeconds === null ||
      turnRemainingSeconds > 0 ||
      !activeDraftKey
    ) {
      return;
    }

    if (autoSubmitKeyRef.current === activeDraftKey) return;
    autoSubmitKeyRef.current = activeDraftKey;

    const autoDecision = scaleDecisionForCash(
      effectiveDecision,
      availableCash,
      researchSpend
    );
    void submitDecisionRequest(autoDecision, true);
  }, [
    activeDraftKey,
    availableCash,
    effectiveDecision,
    isSubmitted,
    mode,
    researchSpend,
    state?.currentPlayer,
    state?.room.status,
    submitDecisionRequest,
    turnRemainingSeconds,
  ]);

  function resetSession() {
    localStorage.removeItem("ice-room-code");
    localStorage.removeItem("ice-host-token");
    localStorage.removeItem("ice-player-token");
    localStorage.removeItem("ice-mode");
    setRoomCode("");
    setJoinCode("");
    setHostToken("");
    setPlayerToken("");
    setState(null);
    setError("");
    setShowSplash(true);
  }

  function enterAs(selectedMode: "instructor" | "player") {
    setMode(selectedMode);
    setShowSplash(false);
  }

  if (showSplash) {
    return <WelcomeSplash enterAs={enterAs} />;
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Simulatore di marketing per la classe</p>
          <h1>
            <span className="logo-emoji">🍦</span> Ice Cream Empire
          </h1>
        </div>
        <div className="top-actions">
          {mode === "player" && state?.currentPlayer ? (
            <span className={`cash-pill ${availableCash < 0 ? "danger" : ""}`}>
              💰 {money(availableCash)}
            </span>
          ) : null}
          {roomCode ? <span className="room-pill">🎟 {roomCode}</span> : null}
          <button className="ghost-button" onClick={resetSession} type="button">
            Nuova sessione
          </button>
          <button
            className="ghost-button"
            onClick={openCookiePreferences}
            type="button"
          >
            Preferenze cookie
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="side-panel">
          <div className="segmented" aria-label="Scegli il ruolo">
            <button
              className={mode === "instructor" ? "active" : ""}
              onClick={() => setMode("instructor")}
              type="button"
            >
              Professore
            </button>
            <button
              className={mode === "player" ? "active" : ""}
              onClick={() => setMode("player")}
              type="button"
            >
              Squadra
            </button>
          </div>

          {mode === "instructor" ? (
            state?.isHost ? (
              <div className="session-badge">
                <span>Stai conducendo</span>
                <strong>{state.room.hostName}</strong>
                <small>Condividi il codice {state.room.code} con la classe.</small>
              </div>
            ) : (
              <div className="control-group">
                <label>
                  Nome del professore
                  <input
                    value={instructorName}
                    onChange={(event) => setInstructorName(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    api({ action: "createRoom", instructorName }).then(() =>
                      setMode("instructor")
                    )
                  }
                  type="button"
                >
                  Crea stanza
                </button>
              </div>
            )
          ) : state?.currentPlayer ? (
            <div className="session-badge">
              <span>Stai giocando come</span>
              <strong>{state.currentPlayer.nickname}</strong>
              <small>Stanza {state.room.code}</small>
            </div>
          ) : (
            <div className="control-group">
              <label>
                Codice stanza
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  maxLength={5}
                />
              </label>
              <label>
                Nome squadra
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Es. Gelato Team"
                />
              </label>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  api({
                    action: "joinRoom",
                    roomCode: joinCode,
                    nickname,
                  }).then(() => setMode("player"))
                }
                type="button"
              >
                Entra nella stanza
              </button>
            </div>
          )}

          {error ? <p className="error">{error}</p> : null}

          {state ? (
            <RoomControls
              state={state}
              mode={mode}
              busy={busy}
              turnRemainingSeconds={turnRemainingSeconds}
              advance={() =>
                api({
                  action: "advanceQuarter",
                  roomCode: state.room.code,
                  hostToken,
                })
              }
            />
          ) : (
            <div className="quiet-note">
              Crea una stanza, condividi il codice e avvia la partita quando la
              classe è entrata.
            </div>
          )}
        </aside>

        <section className="main-stage">
          {state ? (
            <NextStepBanner
              state={state}
              mode={mode}
              turnRemainingSeconds={turnRemainingSeconds}
            />
          ) : null}
          <HowToPlay />
          <CityMap state={state} decision={effectiveDecision} setDecision={setDecision} />
          {state ? (
            <MarketBoard state={state} />
          ) : (
            <div className="empty-board">
              <div className="empty-hero" aria-hidden="true">🍦🍨🍧</div>
              <h2>Gestisci il mercato del gelato per 3 anni, in 12 trimestri.</h2>
              <p>
                Le squadre decidono prodotto, prezzo, luogo e promozione mentre la
                città cambia stagione, traffico, eventi e resa dei canali
                pubblicitari.
              </p>
            </div>
          )}
        </section>

        <aside className="right-panel">
          {state ? (
            <>
              <Leaderboard state={state} />
              {mode === "player" && state.room.status === "active" ? (
                <DecisionPanel
                  state={state}
                  decision={effectiveDecision}
                  setDecision={setDecision}
                  adSpend={adSpend}
                  availableCash={availableCash}
                  researchSpend={researchSpend}
                  selectedRent={selectedRent}
                  remainingCash={remainingCash}
                  projectedCash={projectedCash}
                  isSubmitted={isSubmitted}
                  busy={busy}
                  turnRemainingSeconds={turnRemainingSeconds}
                  purchaseResearch={(researchType) =>
                    api({
                      action: "purchaseResearch",
                      roomCode: state.room.code,
                      playerToken,
                      researchType,
                    })
                  }
                  submit={() => submitDecisionRequest(effectiveDecision)}
                />
              ) : null}
              {currentPlayerResult ? (
                <ResultCard
                  result={currentPlayerResult}
                  breakdown={state.currentPlayerLatestBreakdown}
                  title="Il tuo ultimo risultato"
                />
              ) : null}
            </>
          ) : (
            <div className="leaderboard-placeholder">
              <h2>Come funziona</h2>
              <p>Ricerca, scegli, invia, confronta, discuti, ripeti.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function WelcomeSplash({
  enterAs,
}: {
  enterAs: (mode: "instructor" | "player") => void;
}) {
  return (
    <main className="splash-shell">
      <section className="splash-hero" aria-labelledby="splash-title">
        <div className="splash-copy">
          <p className="eyebrow">Simulatore di marketing per la classe</p>
          <h1 id="splash-title">Ice Cream Empire</h1>
          <p className="splash-lede">
            Una sfida multiplayer in cui la classe gestisce gelaterie rivali,
            investe sulle 4P e scopre trimestre dopo trimestre cosa funziona nel
            mercato.
          </p>

          <div className="splash-actions" aria-label="Scegli come entrare">
            <button
              className="splash-role splash-role-primary"
              onClick={() => enterAs("instructor")}
              type="button"
            >
              <span>Creo e conduco la partita</span>
              <strong>Sono professore</strong>
            </button>
            <button
              className="splash-role"
              onClick={() => enterAs("player")}
              type="button"
            >
              <span>Ho un codice stanza</span>
              <strong>Sono una squadra</strong>
            </button>
          </div>

          <a className="splash-guide-link" href="/guida.html">
            Apri la guida rapida
          </a>
        </div>

        <div className="splash-preview" aria-label="Anteprima del gioco">
          <div className="splash-preview-frame">
            <Image
              alt="Anteprima della plancia di Ice Cream Empire con mappa, classifica e decisioni trimestrali"
              src="/screenshot.jpeg"
              width={1200}
              height={750}
              priority
              unoptimized
            />
          </div>
          <div className="splash-preview-badge">12 trimestri · 4P · squadre rivali</div>
        </div>
      </section>

      <section className="splash-how" aria-label="Come funziona">
        <article>
          <span>1</span>
          <h2>Il professore crea la stanza</h2>
          <p>Condivide il codice, avvia i trimestri e guida la discussione sui risultati.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Le squadre decidono</h2>
          <p>Scelgono prodotto, prezzo, quartiere e budget pubblicitari per ogni turno.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Il mercato reagisce</h2>
          <p>Stagioni, eventi, ricerche e concorrenza cambiano domanda e profitto.</p>
        </article>
        <article>
          <span>4</span>
          <h2>Vince chi gestisce meglio la cassa</h2>
          <p>Dopo 3 anni simulati, la classifica mostra la gelateria più solida.</p>
        </article>
      </section>

      <footer className="splash-footer">
        <p>
          Ice Cream Empire è uno strumento didattico gratuito, liberamente
          utilizzabile in classe.
        </p>
        <p>
          Creato da{" "}
          <a href="https://veda.consulting" target="_blank" rel="noopener">
            VEDA
          </a>
          {" · "}Ispirato allo storico gioco{" "}
          <a
            href="https://www.unibocconi.it/it/news/ice-cream-empire-il-gioco-bocconi-aspiranti-imprenditori"
            target="_blank"
            rel="noopener"
          >
            Ice Cream Empire dell&apos;Università Bocconi
          </a>
        </p>
        <p className="splash-footer-links">
          <a href="/cookie-policy">Cookie policy</a>
          <button onClick={openCookiePreferences} type="button">
            Preferenze cookie
          </button>
        </p>
      </footer>
    </main>
  );
}

function NextStepBanner({
  state,
  mode,
  turnRemainingSeconds,
}: {
  state: ApiState;
  mode: "instructor" | "player";
  turnRemainingSeconds: number | null;
}) {
  const status = state.room.status;
  const total = state.players.length;
  const submitted = state.submittedCount;
  const cash = money(state.currentPlayer?.cash ?? state.room.startingCash);
  const leader = state.leaderboard[0];
  const countdown =
    state.room.status === "active" && turnRemainingSeconds !== null
      ? formatCountdown(turnRemainingSeconds)
      : null;

  const eyebrow = "Cosa fare adesso";
  let title = "";
  let body: React.ReactNode = "";

  if (mode === "instructor") {
    if (status === "lobby") {
      title = "Sei tu a condurre la partita";
      body = (
        <>
          Condividi il codice <strong>{state.room.code}</strong> con la classe.
          Squadre entrate: <strong>{total}</strong>. Quando sono pronte, premi
          «Avvia partita» nel pannello a sinistra.
        </>
      );
    } else if (status === "active") {
      title = `${quarterLabel(state.room.currentQuarter)} in corso`;
      body = (
        <>
          Le squadre stanno decidendo: <strong>{submitted}/{total}</strong> hanno
          inviato. Tempo rimasto: <strong>{countdown}</strong>. Premi «Avanza
          trimestre» a sinistra per calcolare i risultati e passare al trimestre
          successivo.
        </>
      );
    } else {
      title = "Partita conclusa 🎉";
      body = leader ? (
        <>
          Vince <strong>{leader.nickname}</strong> con {money(leader.cash)}{" "}
          in cassa. La classifica completa è a destra.
        </>
      ) : (
        "La partita è finita. Trovi la classifica a destra."
      );
    }
  } else {
    if (!state.currentPlayer) {
      title = "Entra in una stanza";
      body =
        "Inserisci il codice e il nome della tua squadra nel pannello a sinistra per unirti alla partita.";
    } else if (status === "lobby") {
      title = `Sei in gioco come ${state.currentPlayer.nickname}`;
      body = (
        <>
          In attesa che il professore avvii il primo trimestre. Parti con{" "}
          <strong>{cash}</strong> di capitale, da investire in pubblicità e ricerche.
          Preparati a scegliere prodotto, prezzo, luogo e promozione.
        </>
      );
    } else if (status === "active") {
      if (state.playerDecision) {
        title = "Scelte inviate ✓";
        body = (
          <>
            <strong>{submitted}/{total}</strong> squadre pronte. Attendi che il
            professore avanzi il trimestre per vedere i risultati.
            {countdown ? (
              <>
                {" "}
                Tempo rimasto: <strong>{countdown}</strong>.
              </>
            ) : null}
          </>
        );
      } else {
        title = `${quarterLabel(state.room.currentQuarter)}: tocca a te`;
        body = (
          <>
            Hai <strong>{cash}</strong> in cassa da investire questo trimestre. Nel pannello
            a destra: <strong>1)</strong> compra ricerche se vuoi ·{" "}
            <strong>2)</strong> imposta le 4P e i budget pubblicitari ·{" "}
            <strong>3)</strong> premi «Invia trimestre».
            {countdown ? (
              <>
                {" "}
                Tempo rimasto: <strong>{countdown}</strong>.
              </>
            ) : null}
          </>
        );
      }
    } else {
      title = "Partita conclusa 🎉";
      body =
        "Guarda la classifica finale a destra e l'ultimo risultato della tua squadra.";
    }
  }

  return (
    <div className="next-step">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function HowToPlay() {
  return (
    <details className="how-to-play">
      <summary>📖 Come si gioca</summary>
      <div>
        <p>
          <strong>Obiettivo:</strong> gestisci una gelateria per 12 trimestri (3
          anni). Vince la squadra con più <strong>cassa</strong> a fine partita.
        </p>
        <p>
          <strong>Cassa:</strong> ogni squadra parte con <strong>30.000 €</strong> di
          capitale, ben in evidenza. Ogni trimestre la cassa{" "}
          <strong>cambia del profitto</strong> (ricavi − costi: pubblicità, ricerche,
          affitto, costo del venduto). Puoi investire solo ciò che hai in cassa: spendi
          bene per non finire in rosso!
        </p>
        <p>
          <strong>Le 4 leve (4P):</strong> Prodotto, Prezzo, Luogo (il quartiere
          della città) e Promozione (quanto spendi su ciascun canale).
        </p>
        <p>
          <strong>Luogo, una scelta annuale:</strong> la location si sceglie a{" "}
          <strong>inizio anno (Q1)</strong> e si tiene per tutti e 4 i trimestri.
          L&apos;affitto si paga <strong>ogni trimestre</strong>; potrai cambiare
          quartiere solo all&apos;inizio dell&apos;anno successivo. Scegli con cura!
        </p>
        <p>
          <strong>Ricerche di mercato:</strong> a pagamento, svelano dati su
          traffico dei quartieri, segmenti di clienti, resa dei canali e mosse dei
          concorrenti. Ogni ricerca rende più precisa la{" "}
          <strong>«Previsione del trimestre»</strong> (gelati, ricavi e profitto
          attesi) che vedi mentre decidi: è lì che vedi il ritorno della spesa.
        </p>
        <p>
          <strong>Come scorre il gioco:</strong> il professore avvia il trimestre →
          ogni squadra sceglie e invia le sue mosse → il professore avanza → si
          vedono i risultati → si ripete fino al 12° trimestre.
        </p>
      </div>
    </details>
  );
}

function RoomControls({
  state,
  mode,
  busy,
  turnRemainingSeconds,
  advance,
}: {
  state: ApiState;
  mode: "instructor" | "player";
  busy: boolean;
  turnRemainingSeconds: number | null;
  advance: () => void;
}) {
  const statusLabel =
    state.room.status === "lobby"
      ? "In attesa"
      : state.room.status === "complete"
        ? "Conclusa"
        : quarterLabel(state.room.currentQuarter);

  const noPlayers = state.players.length === 0;

  return (
    <div className="room-status">
      <div className="metric-row">
        <span>Stato</span>
        <strong>{statusLabel}</strong>
      </div>
      <div className="metric-row">
        <span>Squadre</span>
        <strong>{state.players.length}/10</strong>
      </div>
      <div className="metric-row">
        <span>Inviati</span>
        <strong>
          {state.submittedCount}/{state.players.length}
        </strong>
      </div>
      {state.room.status === "active" && turnRemainingSeconds !== null ? (
        <div className="metric-row">
          <span>Tempo</span>
          <strong className={turnRemainingSeconds <= 30 ? "danger" : ""}>
            {formatCountdown(turnRemainingSeconds)}
          </strong>
        </div>
      ) : null}
      {mode === "instructor" ? (
        <>
          <button
            className="primary-button"
            disabled={busy || state.room.status === "complete"}
            onClick={advance}
            type="button"
          >
            {state.room.status === "lobby" ? "Avvia partita" : "Avanza trimestre"}
          </button>
          {state.room.status === "lobby" && noPlayers ? (
            <small className="control-hint">
              Serve almeno una squadra collegata per iniziare.
            </small>
          ) : null}
          {state.room.status === "active" ? (
            <small className="control-hint">
              Allo scadere, ogni scheda squadra aperta invia automaticamente le
              scelte correnti. Puoi avanzare quando vuoi calcolare i risultati.
            </small>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const FALLBACK_DISTRICTS = [
  { key: "downtown", label: "Centro", x: 48, y: 31, traffic: 1.2, rent: 980 },
  { key: "campus", label: "Campus", x: 24, y: 58, traffic: 1.05, rent: 620 },
  { key: "park", label: "Parco sul fiume", x: 70, y: 62, traffic: 1.12, rent: 720 },
  { key: "station", label: "Stazione", x: 76, y: 28, traffic: 1.18, rent: 840 },
  { key: "oldtown", label: "Città vecchia", x: 36, y: 24, traffic: 0.94, rent: 690 },
];

// Glifo illustrato per quartiere (emoji = nessun asset esterno da gestire).
const DISTRICT_EMOJI: Record<string, string> = {
  downtown: "🏙️",
  campus: "🎓",
  park: "🌳",
  station: "🚉",
  oldtown: "🏛️",
};

// Scala di domanda fredda→calda: blu (bassa) → verde → giallo → rosso (alta).
function demandColor(normalized: number) {
  const t = Math.max(0, Math.min(1, normalized));
  const hue = 205 - t * 193;
  return `hsl(${hue.toFixed(0)}, 72%, 58%)`;
}

function CityMap({
  state,
  decision,
  setDecision,
}: {
  state: ApiState | null;
  decision: Decision;
  setDecision: (decision: Decision) => void;
}) {
  const districts = state?.options.districts ?? FALLBACK_DISTRICTS;
  const traffic = state?.market.traffic;
  const baseDemand = state?.market.baseline.baseDemand ?? 1;
  const isActive = state?.room.status === "active";
  const lockedDistrict = state?.lockedDistrict ?? null;
  const locked = Boolean(lockedDistrict);
  const currentQuarter = state?.room.currentQuarter ?? 1;
  const nextChangeQuarter = firstQuarterOfYear(currentQuarter) + 4;

  const demandFor = (district: (typeof districts)[number]) => {
    const revealed = traffic?.find((item) => item.key === district.key);
    return baseDemand * (revealed?.traffic ?? district.traffic);
  };
  const demandValues = districts.map(demandFor);
  const minDemand = Math.min(...demandValues);
  const maxDemand = Math.max(...demandValues);
  const demandSpan = Math.max(0.0001, maxDemand - minDemand);

  const selectDistrict = (key: string) => {
    if (locked) return;
    setDecision({ ...decision, district: key });
  };

  return (
    <div className="city-board">
      <div className="board-header">
        <div>
          <p className="eyebrow">Leva: Luogo (Place)</p>
          <h2>🗺️ Mappa della domanda in città</h2>
        </div>
        {state ? (
          <span className="event-chip">
            {EVENT_IT[state.market.baseline.event]?.name ??
              state.market.baseline.event}
          </span>
        ) : null}
      </div>

      {state && isActive ? (
        lockedDistrict ? (
          <p className="map-note locked">
            🔒 La location si sceglie a inizio anno e si mantiene per tutto l&apos;anno.
            Quest&apos;anno sei a{" "}
            <strong>{districtLabel(lockedDistrict, lockedDistrict)}</strong>: potrai
            cambiarla dal prossimo anno ({quarterLabel(nextChangeQuarter)}).
          </p>
        ) : (
          <p className="map-note">
            📍 Scegli ora la location dell&apos;anno: la terrai per tutti e 4 i
            trimestri. L&apos;affitto si paga ogni trimestre.
          </p>
        )
      ) : null}

      <svg className="city-svg" viewBox="0 0 100 80" role="img" aria-label="Mappa della città">
        <ellipse className="zone zone-green" cx="64" cy="60" rx="26" ry="16" />
        <ellipse className="zone zone-warm" cx="46" cy="28" rx="24" ry="15" />
        <path className="river" d="M4 70 C24 56 35 74 54 57 S78 48 96 56" />
        <path className="road" d="M12 18 L86 18 L88 62 L20 68 Z" />
        <path className="road" d="M23 8 L31 70" />
        <path className="road" d="M54 10 L47 69" />
        <path className="road" d="M10 45 L92 38" />
        {[8, 20, 32, 44, 56, 68, 80].map((x, index) => (
          <circle
            className={`walker walker-${index + 1}`}
            cx={x}
            cy={index % 2 === 0 ? 39 : 46}
            r="1.3"
            key={x}
          />
        ))}
        {districts.map((district) => {
          const revealed = traffic?.find((item) => item.key === district.key);
          const trafficValue = revealed?.traffic ?? district.traffic;
          const radius = Math.max(5, Math.min(8.6, 5 + trafficValue * 2.1));
          const selected = decision.district === district.key;
          const isLocked = locked && lockedDistrict === district.key;
          const dimmed = locked && !isLocked;
          const heat = demandColor((demandFor(district) - minDemand) / demandSpan);

          return (
            <g
              className={`district-node ${selected ? "selected" : ""} ${
                dimmed ? "dimmed" : ""
              } ${isLocked ? "locked" : ""}`}
              key={district.key}
              onClick={() => selectDistrict(district.key)}
              tabIndex={locked ? -1 : 0}
              role="button"
              aria-disabled={dimmed}
            >
              <circle
                className="node-disc"
                cx={district.x}
                cy={district.y}
                r={radius}
                style={{ fill: heat }}
              />
              <text
                className="node-glyph"
                x={district.x}
                y={district.y}
                style={{ fontSize: `${radius * 0.95}px` }}
              >
                {DISTRICT_EMOJI[district.key] ?? "📍"}
              </text>
              {isLocked ? (
                <text className="node-lock" x={district.x + radius - 0.5} y={district.y - radius + 1}>
                  🔒
                </text>
              ) : null}
              <text className="node-label" x={district.x} y={district.y + radius + 4}>
                {districtLabel(district.key, district.label)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="map-legend">
        <span className="legend-heat">
          <small>Domanda</small>
          <i className="legend-bar" aria-hidden="true" />
          <small>bassa → alta</small>
        </span>
        <span className="legend-size">⬤ più grande = più traffico</span>
      </div>

      <div className="district-grid">
        {districts.map((district) => {
          const isLocked = locked && lockedDistrict === district.key;
          const dimmed = locked && !isLocked;
          return (
            <button
              className={`${decision.district === district.key ? "active" : ""} ${
                isLocked ? "locked" : ""
              }`}
              disabled={dimmed}
              key={district.key}
              onClick={() => selectDistrict(district.key)}
              type="button"
            >
              <span>
                {districtLabel(district.key, district.label)} {isLocked ? "🔒" : ""}
              </span>
              <small>
                Affitto {money(district.rent)}/trim · {money(district.rent * 4)}/anno
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MarketBoard({ state }: { state: ApiState }) {
  const baseline = state.market.baseline;
  const season = SEASON_IT[baseline.season] ?? baseline.season;
  const seasonNote = SEASON_NOTE_IT[baseline.season] ?? baseline.seasonNote;
  const event = EVENT_IT[baseline.event];

  return (
    <div className="market-board">
      <div className="signal">
        <span>Trimestre</span>
        <strong>
          Anno {baseline.year}, Q{baseline.quarterOfYear}
        </strong>
        <small>
          {season}: {seasonNote}
        </small>
      </div>
      <div className="signal">
        <span>Evento esterno</span>
        <strong>{event?.name ?? baseline.event}</strong>
        <small>{event?.note ?? baseline.eventNote}</small>
      </div>
      <div className="signal">
        <span>Indice di domanda</span>
        <strong>{Math.round(baseline.baseDemand * 100)}%</strong>
        <small>Base di mercato uguale per tutte le squadre.</small>
      </div>
      <div className="signal wide">
        <span>Ricerche sbloccate</span>
        <ResearchSummary state={state} />
      </div>
    </div>
  );
}

function ResearchSummary({ state }: { state: ApiState }) {
  const { traffic, channels, segments, competitors } = state.market;

  if (!traffic && !channels && !competitors && !segments) {
    return (
      <small>
        Compra ricerche per svelare traffico, canali, segmenti o concorrenti.
      </small>
    );
  }

  const channelEntries = channels
    ? ([
        ["Google", channels.google],
        ["Meta", channels.meta],
        ["Influencer", channels.influencer],
      ] as const)
    : null;
  const bestChannel = channelEntries
    ? [...channelEntries].sort((a, b) => b[1] - a[1])[0][0]
    : null;
  const competitorsWithData = competitors?.some((c) => c.product || c.district);

  return (
    <div className="research-summary">
      {traffic ? (
        <div className="research-block">
          <h4>Traffico per quartiere</h4>
          <ul className="research-rank">
            {[...traffic]
              .sort((a, b) => b.traffic - a.traffic)
              .map((district) => (
                <li key={district.key}>
                  <span>{districtLabel(district.key, district.label)}</span>
                  <strong>×{district.traffic.toFixed(2)}</strong>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {channelEntries ? (
        <div className="research-block">
          <h4>Resa dei canali</h4>
          <ul className="research-rank">
            {channelEntries.map(([name, value]) => (
              <li className={name === bestChannel ? "best" : ""} key={name}>
                <span>
                  {name}
                  {name === bestChannel ? " ⭐" : ""}
                </span>
                <strong>{pct(value)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {segments ? (
        <div className="research-block">
          <h4>Affinità prodotto × segmento</h4>
          <div className="research-table-wrap">
            <table className="research-table">
              <thead>
                <tr>
                  <th>Prodotto</th>
                  {Object.keys(SEGMENT_LABELS).map((seg) => (
                    <th key={seg}>{SEGMENT_LABELS[seg]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(segments.productFit).map(([prod, fits]) => (
                  <tr key={prod}>
                    <td>{productLabel(prod, prod)}</td>
                    {Object.keys(SEGMENT_LABELS).map((seg) => {
                      const value = fits[seg] ?? 1;
                      return (
                        <td
                          className={value >= 1.1 ? "hot" : value <= 0.9 ? "cold" : ""}
                          key={seg}
                        >
                          {value.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>
            Tolleranza al prezzo —{" "}
            {Object.entries(segments.segmentPriceTolerance)
              .map(([seg, value]) => `${SEGMENT_LABELS[seg] ?? seg} ${value.toFixed(2)}`)
              .join(" · ")}
          </small>
        </div>
      ) : null}

      {competitors ? (
        <div className="research-block">
          <h4>Concorrenti</h4>
          {competitorsWithData ? (
            <div className="research-table-wrap">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Prodotto</th>
                    <th>Prezzo</th>
                    <th>Quartiere</th>
                    <th>Ricavi</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((competitor) => (
                    <tr key={competitor.nickname}>
                      <td>
                        {competitor.nickname}
                        {competitor.fromPreviousQuarter ? " *" : ""}
                      </td>
                      <td>
                        {competitor.product
                          ? productLabel(competitor.product, competitor.product)
                          : "—"}
                      </td>
                      <td>
                        {competitor.priceTier
                          ? priceLabel(competitor.priceTier, competitor.priceTier)
                          : "—"}
                      </td>
                      <td>
                        {competitor.district
                          ? districtLabel(competitor.districtKey ?? "", competitor.district)
                          : "—"}
                      </td>
                      <td>
                        {typeof competitor.revenue === "number"
                          ? money(competitor.revenue)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <small>In attesa delle prime mosse dei concorrenti.</small>
          )}
          {competitors.some((c) => c.fromPreviousQuarter) ? (
            <small>* posizione del trimestre precedente</small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Leaderboard({ state }: { state: ApiState }) {
  const cashHistory = buildCashHistory(state);

  return (
    <section className="score-panel">
      <div className="panel-heading">
        <p className="eyebrow">Condizione di vittoria</p>
        <h2>🍨 Classifica cassa</h2>
      </div>
      <CashHistoryChart series={cashHistory} hasResults={state.allResults.length > 0} />
      <LatestSalesTable results={state.latestPublicResults} />
      <div className="leaderboard-list">
        {state.leaderboard.length ? (
          state.leaderboard.map((player, index) => (
            <div className="leader-row" key={player.id}>
              <span>{index + 1}</span>
              <strong>{player.nickname}</strong>
              <em className={player.cash < 0 ? "danger" : ""}>{money(player.cash)}</em>
            </div>
          ))
        ) : (
          <p className="muted">In attesa delle squadre.</p>
        )}
      </div>
    </section>
  );
}

function LatestSalesTable({
  results,
}: {
  results: ApiState["latestPublicResults"];
}) {
  if (!results.length) {
    return (
      <div className="public-results empty">
        <span>Vendite ultimo trimestre</span>
        <small>Il resoconto pubblico apparirà dopo il primo trimestre.</small>
      </div>
    );
  }

  return (
    <div className="public-results">
      <div className="public-results-header">
        <span>Vendite ultimo trimestre</span>
        <small>{quarterLabel(results[0].quarter)}</small>
      </div>
      <div className="public-results-table">
        <div className="public-results-row heading">
          <span>Team</span>
          <span>Gelati</span>
          <span>Ricavi</span>
          <span>Profitto</span>
          <span>Quota</span>
        </div>
        {results.map((result) => (
          <div className="public-results-row" key={result.playerId}>
            <strong>{result.nickname}</strong>
            <span>{result.units.toLocaleString("it-IT")}</span>
            <span>{money(result.revenue)}</span>
            <span className={result.profit < 0 ? "danger" : ""}>
              {money(result.profit)}
            </span>
            <span>{Math.round(result.marketShare * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashHistoryChart({
  series,
  hasResults,
}: {
  series: CashHistorySeries[];
  hasResults: boolean;
}) {
  if (!series.length) {
    return null;
  }

  if (!hasResults) {
    return (
      <div className="cash-history empty">
        <span>Andamento cassa</span>
        <small>Il grafico apparirà dopo il primo trimestre.</small>
      </div>
    );
  }

  const allPoints = series.flatMap((item) => item.points);
  const maxQuarter = Math.max(1, ...allPoints.map((point) => point.quarter));
  const rawMinCash = Math.min(...allPoints.map((point) => point.cash));
  const rawMaxCash = Math.max(...allPoints.map((point) => point.cash));
  const cashRange = Math.max(1000, rawMaxCash - rawMinCash);
  const minCash = rawMinCash - cashRange * 0.08;
  const maxCash = rawMaxCash + cashRange * 0.08;
  const chart = {
    width: 320,
    height: 158,
    left: 48,
    right: 12,
    top: 16,
    bottom: 26,
  };
  const innerWidth = chart.width - chart.left - chart.right;
  const innerHeight = chart.height - chart.top - chart.bottom;

  const xFor = (quarter: number) =>
    chart.left + (quarter / maxQuarter) * innerWidth;
  const yFor = (cash: number) =>
    chart.top + ((maxCash - cash) / (maxCash - minCash)) * innerHeight;

  return (
    <div className="cash-history">
      <div className="cash-history-header">
        <span>Andamento cassa</span>
        <small>
          {money(rawMinCash)} - {money(rawMaxCash)}
        </small>
      </div>
      <svg
        className="cash-history-chart"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="Andamento storico della cassa per squadra"
      >
        <line
          className="chart-axis"
          x1={chart.left}
          y1={chart.top}
          x2={chart.left}
          y2={chart.top + innerHeight}
        />
        <line
          className="chart-axis"
          x1={chart.left}
          y1={chart.top + innerHeight}
          x2={chart.left + innerWidth}
          y2={chart.top + innerHeight}
        />
        {[0, 0.5, 1].map((tick) => {
          const y = chart.top + innerHeight * tick;
          return (
            <line
              className="chart-grid"
              key={tick}
              x1={chart.left}
              y1={y}
              x2={chart.left + innerWidth}
              y2={y}
            />
          );
        })}
        <text className="chart-label y-label" x="4" y={chart.top + 4}>
          {money(rawMaxCash)}
        </text>
        <text className="chart-label y-label" x="4" y={chart.top + innerHeight}>
          {money(rawMinCash)}
        </text>
        <text className="chart-label" x={chart.left} y={chart.height - 5}>
          Q0
        </text>
        <text
          className="chart-label end"
          x={chart.left + innerWidth}
          y={chart.height - 5}
        >
          Q{maxQuarter}
        </text>
        {series.map((item) => {
          const path = item.points
            .map((point, index) => {
              const command = index === 0 ? "M" : "L";
              return `${command}${xFor(point.quarter).toFixed(1)},${yFor(point.cash).toFixed(1)}`;
            })
            .join(" ");
          const lastPoint = item.points[item.points.length - 1];

          return (
            <g key={item.playerId}>
              <path
                className="cash-line"
                d={path}
                style={{ stroke: item.color }}
              />
              <circle
                className="cash-point"
                cx={xFor(lastPoint.quarter)}
                cy={yFor(lastPoint.cash)}
                r="2.8"
                style={{ fill: item.color }}
              />
            </g>
          );
        })}
      </svg>
      <div className="cash-history-legend">
        {series.map((item) => (
          <span key={item.playerId}>
            <i style={{ background: item.color }} />
            {item.nickname}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuarterForecast({
  state,
  decision,
  researchSpend,
}: {
  state: ApiState;
  decision: Decision;
  researchSpend: number;
}) {
  const baseline = state.market.baseline;
  const selectedDistrict =
    state.options.districts.find((d) => d.key === decision.district) ?? null;
  const revealedTraffic =
    state.market.traffic?.find((t) => t.key === decision.district) ?? null;
  const trafficKnown = Boolean(state.market.traffic);
  const channelsKnown = Boolean(state.market.channels);
  const competitorsKnown = Boolean(state.market.competitors);
  const adSpend =
    decision.googleBudget + decision.metaBudget + decision.influencerBudget;

  // Con la ricerca «concorrenti» posso stimare l'affollamento dal numero di
  // rivali nello stesso quartiere (stessa formula del motore).
  let crowding: number | null = null;
  if (competitorsKnown && state.market.competitors) {
    const sameDistrict = state.market.competitors.filter(
      (competitor) => competitor.districtKey === decision.district
    ).length;
    crowding = Math.max(0.64, Math.min(1, 1 - Math.max(0, sameDistrict - 1) * 0.08));
  }

  const projection = projectQuarter(
    {
      product: decision.product as QuarterDecisionInput["product"],
      priceTier: decision.priceTier as QuarterDecisionInput["priceTier"],
      district: decision.district as QuarterDecisionInput["district"],
      googleBudget: decision.googleBudget,
      metaBudget: decision.metaBudget,
      influencerBudget: decision.influencerBudget,
    },
    {
      baseDemand: baseline.baseDemand,
      districtTraffic: revealedTraffic?.traffic ?? selectedDistrict?.traffic ?? 1,
      trafficKnown,
      mix: (revealedTraffic?.mix ?? selectedDistrict?.mix ?? {}) as Record<string, number>,
      rent: selectedDistrict?.rent ?? 0,
      channelPower: state.market.channels,
      crowding,
      researchSpend,
    }
  );

  const hints: string[] = [];
  if (!trafficKnown) hints.push("«Mappa traffico» per il traffico reale del quartiere");
  if (!channelsKnown && adSpend > 0)
    hints.push("«Previsione canali» per la resa di ogni canale pubblicitario");
  if (!competitorsKnown) hints.push("«Benchmark concorrenti» per stimare l'affollamento");

  return (
    <div className="forecast">
      <div className="forecast-head">
        <span>🔮 Previsione del trimestre</span>
        <small>Stima dalle tue scelte attuali · l&apos;intervallo è l&apos;incertezza</small>
      </div>
      <div className="forecast-grid">
        <div>
          <small>Gelati</small>
          <strong>{projection.units.toLocaleString("it-IT")}</strong>
          <em>
            {projection.unitsLow.toLocaleString("it-IT")}–
            {projection.unitsHigh.toLocaleString("it-IT")}
          </em>
        </div>
        <div>
          <small>Ricavi</small>
          <strong>{money(projection.revenue)}</strong>
          <em>
            {money(projection.revenueLow)}–{money(projection.revenueHigh)}
          </em>
        </div>
        <div>
          <small>Profitto</small>
          <strong className={projection.profit < 0 ? "danger" : ""}>
            {money(projection.profit)}
          </strong>
          <em>
            {money(projection.profitLow)}–{money(projection.profitHigh)}
          </em>
        </div>
      </div>
      {hints.length ? (
        <ul className="forecast-hints">
          {hints.map((hint) => (
            <li key={hint}>🔎 Compra {hint}.</li>
          ))}
        </ul>
      ) : (
        <p className="forecast-precise">Hai sbloccato tutte le ricerche utili: stima precisa ✓</p>
      )}
    </div>
  );
}

function DecisionPanel({
  state,
  decision,
  setDecision,
  adSpend,
  availableCash,
  researchSpend,
  selectedRent,
  remainingCash,
  projectedCash,
  isSubmitted,
  busy,
  turnRemainingSeconds,
  purchaseResearch,
  submit,
}: {
  state: ApiState;
  decision: Decision;
  setDecision: (decision: Decision) => void;
  adSpend: number;
  availableCash: number;
  researchSpend: number;
  selectedRent: number;
  remainingCash: number;
  projectedCash: number;
  isSubmitted: boolean;
  busy: boolean;
  turnRemainingSeconds: number | null;
  purchaseResearch: (researchType: string) => void;
  submit: () => void;
}) {
  const [pendingResearch, setPendingResearch] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const pending = pendingResearch
    ? state.options.researchOptions.find((o) => o.key === pendingResearch) ?? null
    : null;
  return (
    <section className="decision-panel">
      <div className="panel-heading">
        <p className="eyebrow">🧩 Le tue 4P</p>
        <h2>{isSubmitted ? "Inviato ✓" : "Piano del trimestre"}</h2>
      </div>

      <div className="budget-strip">
        <span>💰 Cassa disponibile</span>
        <strong className={availableCash < 0 ? "danger" : ""}>
          {money(availableCash)}
        </strong>
        <small>
          Pubblicità {money(adSpend)} · ricerche {money(researchSpend)} · affitto{" "}
          {money(selectedRent)}
          <br />
          Cassa proiettata (prima dei ricavi):{" "}
          <strong className={projectedCash < 0 ? "danger" : ""}>
            {money(projectedCash)}
          </strong>
        </small>
      </div>

      {turnRemainingSeconds !== null ? (
        <div className={`timer-strip ${turnRemainingSeconds <= 30 ? "danger" : ""}`}>
          <span>Tempo rimasto</span>
          <strong>{formatCountdown(turnRemainingSeconds)}</strong>
          <small>
            A zero, il sistema invia automaticamente le opzioni selezionate.
          </small>
        </div>
      ) : null}

      <fieldset disabled={isSubmitted || busy}>
        <label>
          Prodotto
          <select
            value={decision.product}
            onChange={(event) =>
              setDecision({ ...decision, product: event.target.value })
            }
          >
            {state.options.products.map((product) => (
              <option key={product.key} value={product.key}>
                {productLabel(product.key, product.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prezzo
          <select
            value={decision.priceTier}
            onChange={(event) =>
              setDecision({ ...decision, priceTier: event.target.value })
            }
          >
            {state.options.priceTiers.map((price) => (
              <option key={price.key} value={price.key}>
                {priceLabel(price.key, price.label)} ({money(price.price)})
              </option>
            ))}
          </select>
        </label>
        <Slider
          label="Google Ads"
          value={decision.googleBudget}
          max={availableCash}
          onChange={(googleBudget) => setDecision({ ...decision, googleBudget })}
        />
        <Slider
          label="Meta Ads"
          value={decision.metaBudget}
          max={availableCash}
          onChange={(metaBudget) => setDecision({ ...decision, metaBudget })}
        />
        <Slider
          label="Influencer"
          value={decision.influencerBudget}
          max={availableCash}
          onChange={(influencerBudget) =>
            setDecision({ ...decision, influencerBudget })
          }
        />
      </fieldset>

      <QuarterForecast state={state} decision={decision} researchSpend={researchSpend} />

      <div className="research-shop">
        <h3>🔎 Ricerche di mercato</h3>
        {pending ? (
          <div className="confirm-box">
            <p>
              Confermi la spesa di <strong>{money(pending.cost)}</strong> per «
              {researchLabel(pending.key, pending.label)}»?
            </p>
            <p className="confirm-sub">
              Cassa proiettata dopo l&apos;acquisto:{" "}
              <strong className={projectedCash - pending.cost < 0 ? "danger" : ""}>
                {money(projectedCash - pending.cost)}
              </strong>
            </p>
            <div className="confirm-actions">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  purchaseResearch(pending.key);
                  setPendingResearch(null);
                }}
                type="button"
              >
                Conferma spesa
              </button>
              <button
                className="ghost-button"
                onClick={() => setPendingResearch(null)}
                type="button"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : null}
        {state.options.researchOptions.map((research) => {
          const bought = state.purchasedResearch.includes(research.key);
          return (
            <button
              disabled={bought || isSubmitted || busy}
              key={research.key}
              onClick={() => setPendingResearch(research.key)}
              type="button"
            >
              <span>{researchLabel(research.key, research.label)}</span>
              <small>{bought ? "Sbloccata ✓" : money(research.cost)}</small>
            </button>
          );
        })}
      </div>

      {showSummary ? (
        <div className="confirm-box summary">
          <h3>Riepilogo del trimestre</h3>
          <ul>
            <li>
              Prodotto: <strong>{productLabel(decision.product, decision.product)}</strong>
            </li>
            <li>
              Prezzo: <strong>{priceLabel(decision.priceTier, decision.priceTier)}</strong>
            </li>
            <li>
              Location:{" "}
              <strong>{districtLabel(decision.district, decision.district)}</strong>{" "}
              (affitto {money(selectedRent)})
            </li>
            <li>
              Pubblicità: Google {money(decision.googleBudget)} · Meta{" "}
              {money(decision.metaBudget)} · Influencer{" "}
              {money(decision.influencerBudget)}
            </li>
            <li>Ricerche acquistate: {money(researchSpend)}</li>
            <li>
              Cassa proiettata (prima dei ricavi):{" "}
              <strong className={projectedCash < 0 ? "danger" : ""}>
                {money(projectedCash)}
              </strong>
            </li>
          </ul>
          <div className="confirm-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => {
                setShowSummary(false);
                submit();
              }}
              type="button"
            >
              Conferma e invia
            </button>
            <button
              className="ghost-button"
              onClick={() => setShowSummary(false)}
              type="button"
            >
              Modifica
            </button>
          </div>
        </div>
      ) : (
        <button
          className="primary-button"
          disabled={busy || isSubmitted || remainingCash < 0}
          onClick={() => setShowSummary(true)}
          type="button"
        >
          {isSubmitted ? "Scelte inviate" : "Invia trimestre"}
        </button>
      )}
    </section>
  );
}

function Slider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const sliderMax = Math.max(1000, Math.round(max));
  return (
    <label>
      <span className="slider-label">
        {label}
        <strong>{money(value)}</strong>
      </span>
      <input
        type="range"
        min="0"
        max={sliderMax}
        step="100"
        value={Math.min(value, sliderMax)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ResultCard({
  result,
  breakdown,
  title,
}: {
  result: ApiState["latestResults"][number];
  breakdown: ApiState["currentPlayerLatestBreakdown"];
  title: string;
}) {
  return (
    <section className="result-panel">
      <div className="panel-heading">
        <p className="eyebrow">Risultato</p>
        <h2>{title}</h2>
      </div>
      <div className="metric-row">
        <span>Ricavi</span>
        <strong>{money(result.revenue)}</strong>
      </div>
      <div className="metric-row">
        <span>Gelati venduti</span>
        <strong>{result.units.toLocaleString("it-IT")}</strong>
      </div>
      <div className="metric-row">
        <span>Profitto</span>
        <strong>{money(result.profit)}</strong>
      </div>
      <div className="metric-row">
        <span>Quota di mercato</span>
        <strong>{Math.round(result.marketShare * 100)}%</strong>
      </div>
      <div className="metric-row">
        <span>Soddisfazione</span>
        <strong>{Math.round(result.satisfaction)}%</strong>
      </div>
      {breakdown ? (
        <>
          <div className="result-breakdown">
            <h3>Ricavi</h3>
            <div className="breakdown-row">
              <span>
                {breakdown.units.toLocaleString("it-IT")} gelati ×{" "}
                {money(breakdown.unitPrice)}
              </span>
              <strong>{money(breakdown.revenue)}</strong>
            </div>
          </div>
          <div className="result-breakdown">
            <h3>Spese</h3>
            <div className="breakdown-row">
              <span>Costo prodotto</span>
              <strong>{money(breakdown.productCost)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Affitto location</span>
              <strong>{money(breakdown.rent)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Pubblicità</span>
              <strong>{money(breakdown.adSpend)}</strong>
            </div>
            <div className="breakdown-row">
              <span>Ricerche</span>
              <strong>{money(breakdown.researchSpend)}</strong>
            </div>
            <div className="breakdown-row total">
              <span>Totale spese</span>
              <strong>{money(breakdown.totalExpenses)}</strong>
            </div>
          </div>
          <div className="profit-equation">
            <span>Profitto</span>
            <strong className={breakdown.profit < 0 ? "danger" : ""}>
              {money(breakdown.revenue)} - {money(breakdown.totalExpenses)} ={" "}
              {money(breakdown.profit)}
            </strong>
          </div>
          <div className="result-breakdown">
            <h3>Fattori del risultato</h3>
            <div className="factor-grid">
              <FactorPill label="Prodotto" value={breakdown.factors.productFit} />
              <FactorPill label="Prezzo" value={breakdown.factors.priceFit} />
              <FactorPill label="Traffico" value={breakdown.factors.traffic} />
              <FactorPill label="Pubblicità" value={breakdown.factors.adLift} />
              <FactorPill label="Affollamento" value={breakdown.factors.crowding} />
              {breakdown.factors.autoSubmitted ? (
                <span className="factor-pill warning">
                  <small>Invio</small>
                  <strong>Automatico</strong>
                </span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function FactorPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="factor-pill">
      <small>{label}</small>
      <strong>{value ? `×${value.toFixed(2)}` : "n/d"}</strong>
    </span>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}
