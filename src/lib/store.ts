// Storage layer for the interface's indexer mirror.
//
// The intelligent contract owns the canonical state on-chain; this store
// exists only so the interface can list and page markets instantly. It has
// two interchangeable backends:
//
//   postgres  durable, used when DATABASE_URL is set
//   memory    zero-configuration, used when it is not — perfect for a
//             stateless deployment (e.g. Vercel) where nothing must be
//             provisioned. State is process-local and resets on restart.
//
// Both backends expose the exact same behavior to the engine, so every
// write rule is enforced identically regardless of persistence.

import { and, desc, eq, sum, sql } from "drizzle-orm";
import { db, isDatabaseError } from "@/db";
import { activity, markets, positions } from "@/db/schema";
import type { SettlementEvidence } from "./types";

export type MarketRow = typeof markets.$inferSelect;
export type PositionRow = typeof positions.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;

export type MarketPatch = Partial<{
  status: string;
  resolution: string | null;
  refundAll: boolean;
  evidence: SettlementEvidence | null;
  resolvedAt: Date | null;
}>;

export type ActivityEntry = ActivityRow & { symbol?: string; marketDate?: string };

export interface Store {
  readonly kind: "postgres" | "memory";
  listMarkets(): Promise<MarketRow[]>;
  getMarket(id: number): Promise<MarketRow | null>;
  findMarket(symbol: string, marketDate: string): Promise<MarketRow | null>;
  createMarket(values: { symbol: string; marketDate: string; createdBy: string }): Promise<MarketRow>;
  updateMarket(id: number, patch: MarketPatch): Promise<void>;

  listPositions(marketId: number): Promise<PositionRow[]>;
  listPositionsForAddress(address: string): Promise<PositionRow[]>;
  getPosition(marketId: number, address: string): Promise<PositionRow | null>;
  insertPosition(values: { marketId: number; address: string; side: string; stake: number }): Promise<PositionRow>;
  updatePosition(id: number, patch: { stake?: number; claimed?: boolean }): Promise<void>;
  sumPositionStakes(): Promise<number>;

  log(values: {
    kind: string;
    marketId?: number | null;
    address?: string | null;
    data?: Record<string, unknown>;
  }): Promise<void>;
  listActivity(limit: number): Promise<ActivityEntry[]>;
  sumClaimedPayouts(): Promise<number>;
}

/* ------------------------------------------------------------------ */
/* PostgreSQL backend                                                  */
/* ------------------------------------------------------------------ */

const postgresStore: Store = {
  kind: "postgres",

  async listMarkets() {
    return db.select().from(markets).orderBy(markets.marketDate, markets.id);
  },

  async getMarket(id) {
    const rows = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async findMarket(symbol, marketDate) {
    const rows = await db
      .select()
      .from(markets)
      .where(and(eq(markets.symbol, symbol), eq(markets.marketDate, marketDate)))
      .limit(1);
    return rows[0] ?? null;
  },

  async createMarket(values) {
    const [row] = await db.insert(markets).values(values).returning();
    return row;
  },

  async updateMarket(id, patch) {
    await db.update(markets).set(patch).where(eq(markets.id, id));
  },

  async listPositions(marketId) {
    return db.select().from(positions).where(eq(positions.marketId, marketId)).orderBy(desc(positions.stake));
  },

  async listPositionsForAddress(address) {
    return db.select().from(positions).where(eq(positions.address, address)).orderBy(desc(positions.updatedAt));
  },

  async getPosition(marketId, address) {
    const rows = await db
      .select()
      .from(positions)
      .where(and(eq(positions.marketId, marketId), eq(positions.address, address)))
      .limit(1);
    return rows[0] ?? null;
  },

  async insertPosition(values) {
    const [row] = await db.insert(positions).values(values).returning();
    return row;
  },

  async updatePosition(id, patch) {
    const finalPatch: { stake?: number; claimed?: boolean; updatedAt: Date } = { ...patch, updatedAt: new Date() };
    await db.update(positions).set(finalPatch).where(eq(positions.id, id));
  },

  async sumPositionStakes() {
    const rows = await db.select({ total: sum(positions.stake) }).from(positions);
    return Number(rows[0]?.total ?? 0);
  },

  async log(values) {
    await db.insert(activity).values({
      kind: values.kind,
      marketId: values.marketId ?? null,
      address: values.address ?? null,
      data: values.data ?? {},
    });
  },

  async listActivity(limit) {
    const safe = Math.min(Math.max(1, limit), 100);
    const rows = await db
      .select({
        id: activity.id,
        kind: activity.kind,
        marketId: activity.marketId,
        address: activity.address,
        data: activity.data,
        createdAt: activity.createdAt,
        symbol: markets.symbol,
        marketDate: markets.marketDate,
      })
      .from(activity)
      .leftJoin(markets, eq(activity.marketId, markets.id))
      .orderBy(desc(activity.id))
      .limit(safe);
    return rows.map((r) => ({ ...r, symbol: r.symbol ?? undefined, marketDate: r.marketDate ?? undefined }));
  },

  async sumClaimedPayouts() {
    const rows = await db
      .select({ total: sql<string>`coalesce(sum((data->>'amount')::numeric), 0)::text` })
      .from(activity)
      .where(eq(activity.kind, "CLAIMED"));
    return Number(rows[0]?.total ?? 0);
  },
};

/* ------------------------------------------------------------------ */
/* In-memory backend — zero-config default                             */
/* ------------------------------------------------------------------ */

type MemoryState = {
  markets: Map<number, MarketRow>;
  positions: Map<number, PositionRow>;
  activity: ActivityRow[];
  marketSeq: number;
  positionSeq: number;
  activitySeq: number;
};

const globalForMemory = globalThis as typeof globalThis & { __verdictMemoryState?: MemoryState };

function state(): MemoryState {
  if (!globalForMemory.__verdictMemoryState) {
    globalForMemory.__verdictMemoryState = {
      markets: new Map(),
      positions: new Map(),
      activity: [],
      marketSeq: 1,
      positionSeq: 1,
      activitySeq: 1,
    };
  }
  return globalForMemory.__verdictMemoryState;
}

export function createMemoryStore(): Store {
  return {
    kind: "memory",

    async listMarkets() {
      return [...state().markets.values()].sort(
        (a, b) => a.marketDate.localeCompare(b.marketDate) || a.id - b.id,
      );
    },

    async getMarket(id) {
      return state().markets.get(id) ?? null;
    },

    async findMarket(symbol, marketDate) {
      for (const m of state().markets.values()) {
        if (m.symbol === symbol && m.marketDate === marketDate) return m;
      }
      return null;
    },

    async createMarket(values) {
      const s = state();
      const row: MarketRow = {
        id: s.marketSeq++,
        symbol: values.symbol,
        marketDate: values.marketDate,
        status: "OPEN",
        resolution: null,
        refundAll: false,
        evidence: null,
        createdBy: values.createdBy,
        createdAt: new Date(),
        resolvedAt: null,
      };
      s.markets.set(row.id, row);
      return row;
    },

    async updateMarket(id, patch) {
      const s = state();
      const row = s.markets.get(id);
      if (!row) return;
      s.markets.set(id, { ...row, ...patch });
    },

    async listPositions(marketId) {
      return [...state().positions.values()]
        .filter((p) => p.marketId === marketId)
        .sort((a, b) => b.stake - a.stake || a.id - b.id);
    },

    async listPositionsForAddress(address) {
      return [...state().positions.values()]
        .filter((p) => p.address === address)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id);
    },

    async getPosition(marketId, address) {
      for (const p of state().positions.values()) {
        if (p.marketId === marketId && p.address === address) return p;
      }
      return null;
    },

    async insertPosition(values) {
      const s = state();
      const now = new Date();
      const row: PositionRow = {
        id: s.positionSeq++,
        marketId: values.marketId,
        address: values.address,
        side: values.side,
        stake: values.stake,
        claimed: false,
        createdAt: now,
        updatedAt: now,
      };
      s.positions.set(row.id, row);
      return row;
    },

    async updatePosition(id, patch) {
      const s = state();
      const row = s.positions.get(id);
      if (!row) return;
      s.positions.set(id, { ...row, ...patch, updatedAt: new Date() });
    },

    async sumPositionStakes() {
      let total = 0;
      for (const p of state().positions.values()) total += p.stake;
      return total;
    },

    async log(values) {
      const s = state();
      s.activity.push({
        id: s.activitySeq++,
        kind: values.kind,
        marketId: values.marketId ?? null,
        address: values.address ?? null,
        data: values.data ?? {},
        createdAt: new Date(),
      });
    },

    async listActivity(limit) {
      const safe = Math.min(Math.max(1, limit), 100);
      const s = state();
      const rows = [...s.activity].sort((a, b) => b.id - a.id).slice(0, safe);
      return rows.map((r) => {
        const market = r.marketId != null ? s.markets.get(r.marketId) : undefined;
        return { ...r, symbol: market?.symbol, marketDate: market?.marketDate };
      });
    },

    async sumClaimedPayouts() {
      let total = 0;
      for (const a of state().activity) {
        if (a.kind !== "CLAIMED") continue;
        const amount = (a.data as Record<string, unknown> | null)?.amount;
        if (typeof amount === "number") total += amount;
      }
      return total;
    },
  };
}

const memoryStore = createMemoryStore();

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

/**
 * The store is chosen by environment: a configured DATABASE_URL means the
 * durable PostgreSQL backend; otherwise the zero-configuration in-memory
 * backend serves the same API. Nothing here requires a database to run.
 */
export function storageMode(): "postgres" | "memory" {
  return process.env.DATABASE_URL ? "postgres" : "memory";
}

export function getStore(): Store {
  return storageMode() === "postgres" ? postgresStore : memoryStore;
}

export { isDatabaseError };
