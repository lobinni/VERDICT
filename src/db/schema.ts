import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { SettlementEvidence } from "@/lib/types";

/**
 * Persistent mirror of the Intelligent Contract's storage. On Bradbury the
 * canonical state lives in the contract's TreeMaps; this indexer mirrors the
 * same transitions so the UI can list and page markets quickly. User GEN
 * balances are never stored — balances belong to MetaMask and the chain.
 */
export const markets = pgTable(
  "markets",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    /** Canonical UTC date "YYYY-MM-DD" of the target daily candle. */
    marketDate: text("market_date").notNull(),
    /** OPEN | LOCKED | RESOLVED */
    status: text("status").notNull().default("OPEN"),
    /** UP | DOWN | INCONCLUSIVE (null until settled) */
    resolution: text("resolution"),
    refundAll: boolean("refund_all").notNull().default(false),
    evidence: jsonb("evidence").$type<SettlementEvidence>(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [uniqueIndex("markets_symbol_date_uidx").on(t.symbol, t.marketDate)],
);

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => markets.id),
    address: text("address").notNull(),
    side: text("side").notNull(), // UP | DOWN
    stake: numeric("stake", { precision: 30, scale: 8, mode: "number" }).notNull(),
    claimed: boolean("claimed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("positions_market_address_uidx").on(t.marketId, t.address),
    index("positions_address_idx").on(t.address),
  ],
);

export const activity = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    marketId: integer("market_id"),
    address: text("address"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export type MarketRow = typeof markets.$inferSelect;
export type PositionRow = typeof positions.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
