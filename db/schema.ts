import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    hostName: text("host_name").notNull(),
    hostToken: text("host_token").notNull(),
    seed: integer("seed").notNull(),
    status: text("status", { enum: ["lobby", "active", "complete"] })
      .notNull()
      .default("lobby"),
    currentQuarter: integer("current_quarter").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    codeIdx: index("rooms_code_idx").on(table.code),
  })
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    nickname: text("nickname").notNull(),
    token: text("token").notNull().unique(),
    cumulativeRevenue: real("cumulative_revenue").notNull().default(0),
    cumulativeProfit: real("cumulative_profit").notNull().default(0),
    cumulativeSatisfaction: real("cumulative_satisfaction").notNull().default(0),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomIdx: index("players_room_idx").on(table.roomId),
    tokenIdx: index("players_token_idx").on(table.token),
  })
);

export const marketSnapshots = sqliteTable(
  "market_snapshots",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    quarter: integer("quarter").notNull(),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomQuarterIdx: index("market_room_quarter_idx").on(
      table.roomId,
      table.quarter
    ),
  })
);

export const researchPurchases = sqliteTable(
  "research_purchases",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    quarter: integer("quarter").notNull(),
    type: text("type").notNull(),
    cost: integer("cost").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    playerQuarterIdx: index("research_player_quarter_idx").on(
      table.playerId,
      table.quarter
    ),
  })
);

export const quarterDecisions = sqliteTable(
  "quarter_decisions",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    quarter: integer("quarter").notNull(),
    product: text("product").notNull(),
    priceTier: text("price_tier").notNull(),
    district: text("district").notNull(),
    googleBudget: integer("google_budget").notNull(),
    metaBudget: integer("meta_budget").notNull(),
    influencerBudget: integer("influencer_budget").notNull(),
    researchSpend: integer("research_spend").notNull(),
    autoSubmitted: integer("auto_submitted", { mode: "boolean" })
      .notNull()
      .default(false),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomQuarterIdx: index("decisions_room_quarter_idx").on(
      table.roomId,
      table.quarter
    ),
    playerQuarterIdx: index("decisions_player_quarter_idx").on(
      table.playerId,
      table.quarter
    ),
  })
);

export const quarterResults = sqliteTable(
  "quarter_results",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    quarter: integer("quarter").notNull(),
    revenue: real("revenue").notNull(),
    profit: real("profit").notNull(),
    units: integer("units").notNull(),
    marketShare: real("market_share").notNull(),
    satisfaction: real("satisfaction").notNull(),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomQuarterIdx: index("results_room_quarter_idx").on(
      table.roomId,
      table.quarter
    ),
    playerQuarterIdx: index("results_player_quarter_idx").on(
      table.playerId,
      table.quarter
    ),
  })
);
