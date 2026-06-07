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
  const [instructorName, setInstructorName] = useState("Professor");
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
          <p className="eyebrow">Marketing mix classroom simulator</p>
          <h1>Ice Cream Empire</h1>
        </div>
        <div className="top-actions">
          {roomCode ? <span className="room-pill">Room {roomCode}</span> : null}
          <button className="ghost-button" onClick={resetSession} type="button">
            New session
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="side-panel">
          <div className="segmented" aria-label="Choose role">
            <button
              className={mode === "instructor" ? "active" : ""}
              onClick={() => setMode("instructor")}
              type="button"
            >
              Instructor
            </button>
            <button
              className={mode === "player" ? "active" : ""}
              onClick={() => setMode("player")}
              type="button"
            >
              Player
            </button>
          </div>

          {mode === "instructor" ? (
            state?.isHost ? (
              <div className="session-badge">
                <span>Hosting room</span>
                <strong>{state.room.hostName}</strong>
                <small>Share code {state.room.code} with the class.</small>
              </div>
            ) : (
              <div className="control-group">
                <label>
                  Instructor name
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
                  Create room
                </button>
              </div>
            )
          ) : state?.currentPlayer ? (
            <div className="session-badge">
              <span>Playing as</span>
              <strong>{state.currentPlayer.nickname}</strong>
              <small>Room {state.room.code}</small>
            </div>
          ) : (
            <div className="control-group">
              <label>
                Room code
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  maxLength={5}
                />
              </label>
              <label>
                Nickname
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Team Gelato"
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
                Join room
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
              Create a room, share the code, and start once the class has joined.
            </div>
          )}
        </aside>

        <section className="main-stage">
          <CityMap state={state} decision={decision} setDecision={setDecision} />
          {state ? (
            <MarketBoard state={state} />
          ) : (
            <div className="empty-board">
              <h2>Run a three-year ice cream market in 12 quarters.</h2>
              <p>
                Students decide product, price, place, and promotion while the
                city changes season, traffic, events, and channel response.
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
                <ResultCard result={currentPlayerResult} title="Your last result" />
              ) : null}
            </>
          ) : (
            <div className="leaderboard-placeholder">
              <h2>Teaching loop</h2>
              <p>Research, choose, submit, compare, discuss, repeat.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
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
      ? "Lobby"
      : state.room.status === "complete"
        ? "Complete"
        : `Year ${Math.ceil(state.room.currentQuarter / 4)} / Q${
            ((state.room.currentQuarter - 1) % 4) + 1
          }`;

  return (
    <div className="room-status">
      <div className="metric-row">
        <span>Status</span>
        <strong>{statusLabel}</strong>
      </div>
      <div className="metric-row">
        <span>Players</span>
        <strong>{state.players.length}/10</strong>
      </div>
      <div className="metric-row">
        <span>Submitted</span>
        <strong>
          {state.submittedCount}/{state.players.length}
        </strong>
      </div>
      {mode === "instructor" ? (
        <button
          className="primary-button"
          disabled={busy || state.room.status === "complete"}
          onClick={advance}
          type="button"
        >
          {state.room.status === "lobby" ? "Start game" : "Advance quarter"}
        </button>
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
    { key: "downtown", label: "Downtown", x: 48, y: 31, traffic: 1.2, rent: 980 },
    { key: "campus", label: "Campus", x: 24, y: 58, traffic: 1.05, rent: 620 },
    { key: "park", label: "Riverside Park", x: 70, y: 62, traffic: 1.12, rent: 720 },
    { key: "station", label: "Station", x: 76, y: 28, traffic: 1.18, rent: 840 },
    { key: "oldtown", label: "Old Town", x: 36, y: 24, traffic: 0.94, rent: 690 },
  ];
  const traffic = state?.market.traffic;

  return (
    <div className="city-board">
      <div className="board-header">
        <div>
          <p className="eyebrow">Place decision</p>
          <h2>City demand map</h2>
        </div>
        {state ? (
          <span className="event-chip">{state.market.baseline.event}</span>
        ) : null}
      </div>
      <svg className="city-svg" viewBox="0 0 100 78" role="img" aria-label="City map">
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
                {district.label}
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
            <span>{district.label}</span>
            <small>Rent ${district.rent}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketBoard({ state }: { state: ApiState }) {
  const baseline = state.market.baseline;

  return (
    <div className="market-board">
      <div className="signal">
        <span>Quarter</span>
        <strong>
          Year {baseline.year}, Q{baseline.quarterOfYear}
        </strong>
        <small>
          {baseline.season}: {baseline.seasonNote}
        </small>
      </div>
      <div className="signal">
        <span>External event</span>
        <strong>{baseline.event}</strong>
        <small>{baseline.eventNote}</small>
      </div>
      <div className="signal">
        <span>Demand index</span>
        <strong>{Math.round(baseline.baseDemand * 100)}%</strong>
        <small>Free market baseline for every team.</small>
      </div>
      <div className="signal wide">
        <span>Unlocked research</span>
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
      <small>Buy research to reveal traffic, channel, segment, or competitor data.</small>
    );
  }

  return (
    <div className="research-summary">
      {state.market.traffic ? (
        <p>
          Best traffic:{" "}
          <strong>
            {[...state.market.traffic].sort((a, b) => b.traffic - a.traffic)[0].label}
          </strong>
        </p>
      ) : null}
      {state.market.channels ? (
        <p>
          Channel forecast: Google {pct(state.market.channels.google)}, Meta{" "}
          {pct(state.market.channels.meta)}, Influencer{" "}
          {pct(state.market.channels.influencer)}
        </p>
      ) : null}
      {state.market.segments ? <p>Segment preferences unlocked.</p> : null}
      {state.market.competitors ? (
        <p>
          Competitors visible:{" "}
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
        <p className="eyebrow">Win condition</p>
        <h2>Revenue leaderboard</h2>
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
          <p className="muted">Waiting for players.</p>
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
        <p className="eyebrow">4P decision</p>
        <h2>{isSubmitted ? "Submitted" : "Quarter plan"}</h2>
      </div>

      <div className="budget-strip">
        <span>Budget left</span>
        <strong className={remainingBudget < 0 ? "danger" : ""}>
          {money(remainingBudget)}
        </strong>
        <small>
          Ads {money(adSpend)} + research {money(state.researchSpend)}
        </small>
      </div>

      <fieldset disabled={isSubmitted || busy}>
        <label>
          Product
          <select
            value={decision.product}
            onChange={(event) =>
              setDecision({ ...decision, product: event.target.value })
            }
          >
            {state.options.products.map((product) => (
              <option key={product.key} value={product.key}>
                {product.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price
          <select
            value={decision.priceTier}
            onChange={(event) =>
              setDecision({ ...decision, priceTier: event.target.value })
            }
          >
            {state.options.priceTiers.map((price) => (
              <option key={price.key} value={price.key}>
                {price.label} (${price.price.toFixed(2)})
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
        <h3>Market research</h3>
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
              <small>{bought ? "Unlocked" : money(research.cost)}</small>
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
        Submit quarter
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
        <p className="eyebrow">Feedback</p>
        <h2>{title}</h2>
      </div>
      <div className="metric-row">
        <span>Revenue</span>
        <strong>{money(result.revenue)}</strong>
      </div>
      <div className="metric-row">
        <span>Profit</span>
        <strong>{money(result.profit)}</strong>
      </div>
      <div className="metric-row">
        <span>Market share</span>
        <strong>{Math.round(result.marketShare * 100)}%</strong>
      </div>
      <div className="metric-row">
        <span>Satisfaction</span>
        <strong>{Math.round(result.satisfaction)}%</strong>
      </div>
    </section>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}
