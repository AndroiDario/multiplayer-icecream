"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApiState = {
  room: {
    code: string;
    hostName: string;
    status: "lobby" | "active" | "complete";
    currentQuarter: number;
    totalQuarters: number;
    quarterBudget: number;
  };
  isHost: boolean;
  currentPlayer: null | { id: string; nickname: string; token: string };
  players: Array<{
    id: string;
    nickname: string;
    cumulativeRevenue: number;
    cumulativeProfit: number;
    averageSatisfaction: number;
  }>;
  leaderboard: Array<{
    id: string;
    nickname: string;
    cumulativeRevenue: number;
    cumulativeProfit: number;
  }>;
  submittedPlayerIds: string[];
  submittedCount: number;
  playerDecision: null | Record<string, unknown>;
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
    segments: null | Record<string, unknown>;
    channels: null | { google: number; meta: number; influencer: number };
    competitors:
      | null
      | Array<{
          nickname: string;
          product?: string | null;
          priceTier?: string | null;
          district?: string | null;
          revenue?: number | null;
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

function productLabel(key: string, fallback: string) {
  return PRODUCT_LABELS[key] ?? fallback;
}
function priceLabel(key: string, fallback: string) {
  return PRICE_LABELS[key] ?? fallback;
}
function districtLabel(key: string, fallback: string) {
  return DISTRICT_LABELS[key] ?? fallback;
}
function quarterLabel(quarter: number) {
  const q = Math.max(1, quarter);
  return `Anno ${Math.ceil(q / 4)} · Q${((q - 1) % 4) + 1}`;
}

function readStoredSession() {
  if (typeof window === "undefined") {
    return {
      mode: "instructor" as const,
      roomCode: "",
      hostToken: "",
      playerToken: "",
    };
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

export default function GameClient() {
  const [initialSession] = useState(readStoredSession);
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

  const loadState = useCallback(async () => {
    if (!roomCode) return;
    const params = new URLSearchParams({ roomCode });
    if (mode === "instructor" && hostToken) params.set("hostToken", hostToken);
    if (mode === "player" && playerToken) params.set("playerToken", playerToken);
    const response = await fetch(`/api/game?${params.toString()}`);
    const data = await response.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setState(data);
  }, [hostToken, mode, playerToken, roomCode]);

  useEffect(() => {
    if (!roomCode) return undefined;
    const firstPoll = window.setTimeout(() => void loadState(), 0);
    const interval = window.setInterval(() => void loadState(), 3200);
    return () => {
      window.clearTimeout(firstPoll);
      window.clearInterval(interval);
    };
  }, [loadState, roomCode]);

  const api = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      if (data.state) setState(data.state);
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

  const adSpend =
    decision.googleBudget + decision.metaBudget + decision.influencerBudget;
  const researchSpend = state?.researchSpend ?? 0;
  const remainingBudget =
    (state?.room.quarterBudget ?? 9000) - adSpend - researchSpend;
  const isSubmitted = Boolean(state?.playerDecision);

  function resetSession() {
    localStorage.removeItem("ice-room-code");
    localStorage.removeItem("ice-host-token");
    localStorage.removeItem("ice-player-token");
    localStorage.removeItem("ice-mode");
    setRoomCode("");
    setHostToken("");
    setPlayerToken("");
    setState(null);
    setError("");
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Simulatore di marketing per la classe</p>
          <h1>Ice Cream Empire</h1>
        </div>
        <div className="top-actions">
          {roomCode ? <span className="room-pill">Stanza {roomCode}</span> : null}
          <button className="ghost-button" onClick={resetSession} type="button">
            Nuova sessione
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
          {state ? <NextStepBanner state={state} mode={mode} /> : null}
          <HowToPlay />
          <CityMap state={state} decision={decision} setDecision={setDecision} />
          {state ? (
            <MarketBoard state={state} />
          ) : (
            <div className="empty-board">
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
                  decision={decision}
                  setDecision={setDecision}
                  adSpend={adSpend}
                  remainingBudget={remainingBudget}
                  isSubmitted={isSubmitted}
                  busy={busy}
                  purchaseResearch={(researchType) =>
                    api({
                      action: "purchaseResearch",
                      roomCode: state.room.code,
                      playerToken,
                      researchType,
                    })
                  }
                  submit={() =>
                    api({
                      action: "submitDecision",
                      roomCode: state.room.code,
                      playerToken,
                      decision,
                    })
                  }
                />
              ) : null}
              {currentPlayerResult ? (
                <ResultCard
                  result={currentPlayerResult}
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

function NextStepBanner({
  state,
  mode,
}: {
  state: ApiState;
  mode: "instructor" | "player";
}) {
  const status = state.room.status;
  const total = state.players.length;
  const submitted = state.submittedCount;
  const budget = money(state.room.quarterBudget);
  const leader = state.leaderboard[0];

  let eyebrow = "Cosa fare adesso";
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
          inviato. Premi «Avanza trimestre» a sinistra per calcolare i risultati e
          passare al trimestre successivo.
        </>
      );
    } else {
      title = "Partita conclusa 🎉";
      body = leader ? (
        <>
          Vince <strong>{leader.nickname}</strong> con {money(leader.cumulativeRevenue)}{" "}
          di ricavi. La classifica completa è a destra.
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
          In attesa che il professore avvii il primo trimestre. Ogni trimestre avrai{" "}
          <strong>{budget}</strong> da investire in pubblicità e ricerche di mercato.
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
          </>
        );
      } else {
        title = `${quarterLabel(state.room.currentQuarter)}: tocca a te`;
        body = (
          <>
            Hai <strong>{budget}</strong> da investire questo trimestre. Nel pannello
            a destra: <strong>1)</strong> compra ricerche se vuoi ·{" "}
            <strong>2)</strong> imposta le 4P e i budget pubblicitari ·{" "}
            <strong>3)</strong> premi «Invia trimestre».
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
          anni). Vince la squadra con più <strong>ricavi totali</strong>.
        </p>
        <p>
          <strong>Ogni trimestre</strong> hai <strong>9.000 €</strong> da investire
          in pubblicità (Google, Meta, Influencer) e in ricerche di mercato. Il
          budget si rinnova ogni trimestre: non è una cassa che si svuota.
        </p>
        <p>
          <strong>Le 4 leve (4P):</strong> Prodotto, Prezzo, Luogo (il quartiere
          della città) e Promozione (quanto spendi su ciascun canale).
        </p>
        <p>
          <strong>Ricerche di mercato:</strong> a pagamento, svelano dati su
          traffico dei quartieri, segmenti di clienti, resa dei canali e mosse dei
          concorrenti.
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
  advance,
}: {
  state: ApiState;
  mode: "instructor" | "player";
  busy: boolean;
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
              Puoi avanzare anche se non tutte le squadre hanno inviato: chi non
              invia gioca con scelte di default.
            </small>
          ) : null}
        </>
      ) : null}
    </div>
  );
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
  const districts = state?.options.districts ?? [
    { key: "downtown", label: "Centro", x: 48, y: 31, traffic: 1.2, rent: 980 },
    { key: "campus", label: "Campus", x: 24, y: 58, traffic: 1.05, rent: 620 },
    { key: "park", label: "Parco sul fiume", x: 70, y: 62, traffic: 1.12, rent: 720 },
    { key: "station", label: "Stazione", x: 76, y: 28, traffic: 1.18, rent: 840 },
    { key: "oldtown", label: "Città vecchia", x: 36, y: 24, traffic: 0.94, rent: 690 },
  ];
  const traffic = state?.market.traffic;

  return (
    <div className="city-board">
      <div className="board-header">
        <div>
          <p className="eyebrow">Leva: Luogo (Place)</p>
          <h2>Mappa della domanda in città</h2>
        </div>
        {state ? (
          <span className="event-chip">
            {EVENT_IT[state.market.baseline.event]?.name ??
              state.market.baseline.event}
          </span>
        ) : null}
      </div>
      <svg className="city-svg" viewBox="0 0 100 78" role="img" aria-label="Mappa della città">
        <path className="river" d="M4 68 C24 54 35 72 54 55 S78 46 96 54" />
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
          const radius = Math.max(4.6, Math.min(8.5, 4.8 + trafficValue * 2.2));
          const selected = decision.district === district.key;

          return (
            <g
              className={`district-node ${selected ? "selected" : ""}`}
              key={district.key}
              onClick={() => setDecision({ ...decision, district: district.key })}
              tabIndex={0}
              role="button"
            >
              <circle cx={district.x} cy={district.y} r={radius} />
              <text x={district.x} y={district.y + 13}>
                {districtLabel(district.key, district.label)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="district-grid">
        {districts.map((district) => (
          <button
            className={decision.district === district.key ? "active" : ""}
            key={district.key}
            onClick={() => setDecision({ ...decision, district: district.key })}
            type="button"
          >
            <span>{districtLabel(district.key, district.label)}</span>
            <small>Affitto {money(district.rent)}</small>
          </button>
        ))}
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
  if (
    !state.market.traffic &&
    !state.market.channels &&
    !state.market.competitors &&
    !state.market.segments
  ) {
    return (
      <small>
        Compra ricerche per svelare traffico, canali, segmenti o concorrenti.
      </small>
    );
  }

  return (
    <div className="research-summary">
      {state.market.traffic ? (
        <p>
          Traffico migliore:{" "}
          <strong>
            {(() => {
              const best = [...state.market.traffic].sort(
                (a, b) => b.traffic - a.traffic
              )[0];
              return districtLabel(best.key, best.label);
            })()}
          </strong>
        </p>
      ) : null}
      {state.market.channels ? (
        <p>
          Previsione canali: Google {pct(state.market.channels.google)}, Meta{" "}
          {pct(state.market.channels.meta)}, Influencer{" "}
          {pct(state.market.channels.influencer)}
        </p>
      ) : null}
      {state.market.segments ? <p>Preferenze dei segmenti sbloccate.</p> : null}
      {state.market.competitors ? (
        <p>
          Concorrenti visibili:{" "}
          {state.market.competitors
            .map((competitor) => competitor.nickname)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function Leaderboard({ state }: { state: ApiState }) {
  return (
    <section className="score-panel">
      <div className="panel-heading">
        <p className="eyebrow">Condizione di vittoria</p>
        <h2>Classifica ricavi</h2>
      </div>
      <div className="leaderboard-list">
        {state.leaderboard.length ? (
          state.leaderboard.map((player, index) => (
            <div className="leader-row" key={player.id}>
              <span>{index + 1}</span>
              <strong>{player.nickname}</strong>
              <em>{money(player.cumulativeRevenue)}</em>
            </div>
          ))
        ) : (
          <p className="muted">In attesa delle squadre.</p>
        )}
      </div>
    </section>
  );
}

function DecisionPanel({
  state,
  decision,
  setDecision,
  adSpend,
  remainingBudget,
  isSubmitted,
  busy,
  purchaseResearch,
  submit,
}: {
  state: ApiState;
  decision: Decision;
  setDecision: (decision: Decision) => void;
  adSpend: number;
  remainingBudget: number;
  isSubmitted: boolean;
  busy: boolean;
  purchaseResearch: (researchType: string) => void;
  submit: () => void;
}) {
  return (
    <section className="decision-panel">
      <div className="panel-heading">
        <p className="eyebrow">Le tue 4P</p>
        <h2>{isSubmitted ? "Inviato ✓" : "Piano del trimestre"}</h2>
      </div>

      <div className="budget-strip">
        <span>Budget rimasto questo trimestre</span>
        <strong className={remainingBudget < 0 ? "danger" : ""}>
          {money(remainingBudget)}
        </strong>
        <small>
          Pubblicità {money(adSpend)} + ricerche {money(state.researchSpend)} su{" "}
          {money(state.room.quarterBudget)}. Si rinnova ogni trimestre; la
          classifica premia i ricavi totali.
        </small>
      </div>

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
          onChange={(googleBudget) => setDecision({ ...decision, googleBudget })}
        />
        <Slider
          label="Meta Ads"
          value={decision.metaBudget}
          onChange={(metaBudget) => setDecision({ ...decision, metaBudget })}
        />
        <Slider
          label="Influencer"
          value={decision.influencerBudget}
          onChange={(influencerBudget) =>
            setDecision({ ...decision, influencerBudget })
          }
        />
      </fieldset>

      <div className="research-shop">
        <h3>Ricerche di mercato</h3>
        {state.options.researchOptions.map((research) => {
          const bought = state.purchasedResearch.includes(research.key);
          return (
            <button
              disabled={bought || isSubmitted || busy}
              key={research.key}
              onClick={() => purchaseResearch(research.key)}
              type="button"
            >
              <span>{research.label}</span>
              <small>{bought ? "Sbloccata ✓" : money(research.cost)}</small>
            </button>
          );
        })}
      </div>

      <button
        className="primary-button"
        disabled={busy || isSubmitted || remainingBudget < 0}
        onClick={submit}
        type="button"
      >
        {isSubmitted ? "Scelte inviate" : "Invia trimestre"}
      </button>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="slider-label">
        {label}
        <strong>{money(value)}</strong>
      </span>
      <input
        type="range"
        min="0"
        max="9000"
        step="100"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ResultCard({
  result,
  title,
}: {
  result: ApiState["latestResults"][number];
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
    </section>
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
