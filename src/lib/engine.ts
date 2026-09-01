// Deterministic server mirror of contracts/Verdict.py. Every public write
// validates fully before mutating storage, exactly like the Intelligent
// Contract's write methods under Optimistic Democracy. Storage is pluggable
// (see src/lib/store.ts): a durable PostgreSQL backend when DATABASE_URL is
// configured, otherwise a zero-configuration in-memory backend — the
// interface never requires a database to run. GEN balances are never
// stored here: custody belongs to the contract and balances are read from
// the connected MetaMask wallet on-chain.

import {
  isSupportedSymbol,
  MAX_POSITION_GEN,
  MIN_POSITION_GEN,
  OPEN_LIMIT_DAYS,
  symbolMeta,
} from "./constants";
import { runConsensus } from "./evidence";
import { isAddress, round8 } from "./format";
import { getStore, type MarketRow, type PositionRow, type ActivityEntry } from "./store";
import { addDays, candleCloseMs, candleOpenMs, isCanonicalDate, phaseOf, todayUtc } from "./time";
import type { ActivityView, MarketView, PositionView, Side } from "./types";

export class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export type Pools = { up: number; down: number; upN: number; downN: number };

export async function getPools(marketId: number): Promise<Pools> {
  const rows = await getStore().listPositions(marketId);
  const pools: Pools = { up: 0, down: 0, upN: 0, downN: 0 };
  for (const p of rows) {
    if (p.side === "UP") {
      pools.up = round8(pools.up + p.stake);
      pools.upN += 1;
    } else {
      pools.down = round8(pools.down + p.stake);
      pools.downN += 1;
    }
  }
  return pools;
}

export function toMarketView(row: MarketRow, pools: Pools, now = Date.now()): MarketView {
  const meta = symbolMeta(row.symbol);
  return {
    id: row.id,
    symbol: row.symbol,
    ticker: meta?.ticker ?? row.symbol,
    name: meta?.name ?? row.symbol,
    marketDate: row.marketDate,
    status: row.status as MarketView["status"],
    resolution: row.resolution as MarketView["resolution"],
    refundAll: row.refundAll,
    phase: phaseOf(
      {
        status: row.status as MarketView["status"],
        resolution: row.resolution as MarketView["resolution"],
        refundAll: row.refundAll,
        marketDate: row.marketDate,
      },
      now,
    ),
    candleOpenMs: candleOpenMs(row.marketDate),
    candleCloseMs: candleCloseMs(row.marketDate),
    upPool: pools.up,
    downPool: pools.down,
    totalPool: round8(pools.up + pools.down),
    upPositions: pools.upN,
    downPositions: pools.downN,
    positionCount: pools.upN + pools.downN,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function getMarketRow(id: number): Promise<MarketRow | null> {
  return getStore().getMarket(id);
}

export async function listMarketViews(now = Date.now()): Promise<MarketView[]> {
  const rows = await getStore().listMarkets();
  const views: MarketView[] = [];
  for (const row of rows) {
    views.push(toMarketView(row, await getPools(row.id), now));
  }
  return views;
}

export type MarketDetail = {
  view: MarketView;
  evidence: MarketRow["evidence"];
  positions: PositionView[];
};

export async function getMarketDetail(id: number, now = Date.now()): Promise<MarketDetail | null> {
  const row = await getMarketRow(id);
  if (!row) return null;
  const [pools, rows] = await Promise.all([getPools(id), getStore().listPositions(id)]);
  return {
    view: toMarketView(row, pools, now),
    evidence: row.evidence,
    positions: rows.map(toPositionView),
  };
}

function toPositionView(r: PositionRow): PositionView {
  return {
    id: r.id,
    marketId: r.marketId,
    address: r.address,
    side: r.side as Side,
    stake: r.stake,
    claimed: r.claimed,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getPosition(marketId: number, address: string): Promise<PositionView | null> {
  const row = await getStore().getPosition(marketId, address.toLowerCase());
  return row ? toPositionView(row) : null;
}

/* ------------------------------------------------------------------ */
/* Writes — mirror the 5 write methods of the contract                  */
/* ------------------------------------------------------------------ */

/** open_market(symbol, market_date) — permissionless. */
export async function openMarket(address: string, symbol: string, marketDate: string) {
  if (!isAddress(address)) throw new EngineError("INVALID_SENDER", "Connect a wallet to create a market.");
  if (!isSupportedSymbol(symbol))
    throw new EngineError("UNSUPPORTED_SYMBOL", `Symbol ${symbol} is not supported.`);
  if (!isCanonicalDate(marketDate))
    throw new EngineError("INVALID_DATE", "market_date must be a canonical UTC date (YYYY-MM-DD).");

  const today = todayUtc();
  if (marketDate <= today)
    throw new EngineError("DATE_NOT_FUTURE", "Market date must be a future UTC date.");
  if (marketDate > addDays(today, OPEN_LIMIT_DAYS))
    throw new EngineError("DATE_TOO_FAR", `Market date exceeds the ${OPEN_LIMIT_DAYS}-day forward limit.`);

  const store = getStore();
  const dup = await store.findMarket(symbol, marketDate);
  if (dup) throw new EngineError("MARKET_EXISTS", "A market already exists for this symbol and date.");

  const row = await store.createMarket({ symbol, marketDate, createdBy: address.toLowerCase() });
  await store.log({
    kind: "MARKET_CREATED",
    marketId: row.id,
    address: address.toLowerCase(),
    data: { symbol, marketDate },
  });
  return toMarketView(row, { up: 0, down: 0, upN: 0, downN: 0 });
}

/** take_position(market_id, side) — payable: stake is the transaction value. */
export async function takePosition(address: string, marketId: number, side: Side, amount: number) {
  if (!isAddress(address)) throw new EngineError("INVALID_SENDER", "Connect a wallet to take a position.");
  if (side !== "UP" && side !== "DOWN") throw new EngineError("INVALID_SIDE", "Side must be UP or DOWN.");
  const stake = round8(amount);
  if (!Number.isFinite(stake) || stake < MIN_POSITION_GEN)
    throw new EngineError("BELOW_MINIMUM", `Minimum position is ${MIN_POSITION_GEN} GEN.`);

  const store = getStore();
  const row = await store.getMarket(marketId);
  if (!row) throw new EngineError("MARKET_NOT_FOUND", "Market not found.");
  if (row.status !== "OPEN") throw new EngineError("ENTRIES_CLOSED", "Entries for this market are closed.");
  if (Date.now() >= candleOpenMs(row.marketDate))
    throw new EngineError("ENTRIES_CLOSED", "The target candle has started; entries are closed.");

  const owner = address.toLowerCase();
  const existing = await store.getPosition(marketId, owner);
  if (existing && existing.side !== side)
    throw new EngineError("SIDE_SWITCH_REJECTED", "Switching sides within a market is not allowed.");
  const cumulative = round8((existing?.stake ?? 0) + stake);
  if (cumulative > MAX_POSITION_GEN)
    throw new EngineError(
      "POSITION_CAP_EXCEEDED",
      `Cumulative position cap is ${MAX_POSITION_GEN} GEN per wallet per market.`,
    );

  if (existing) {
    await store.updatePosition(existing.id, { stake: cumulative });
  } else {
    await store.insertPosition({ marketId, address: owner, side, stake });
  }
  await store.log({ kind: "POSITION_TAKEN", marketId, address: owner, data: { side, amount: stake } });

  return getPosition(marketId, owner);
}

/** close_entries(market_id) — permissionless at/after the UTC cutoff. */
export async function closeEntries(address: string, marketId: number) {
  if (!isAddress(address)) throw new EngineError("INVALID_SENDER", "Connect a wallet first.");
  const store = getStore();
  const row = await store.getMarket(marketId);
  if (!row) throw new EngineError("MARKET_NOT_FOUND", "Market not found.");
  if (row.status === "RESOLVED") throw new EngineError("ALREADY_RESOLVED", "Market is already resolved.");
  if (row.status === "LOCKED") throw new EngineError("ALREADY_LOCKED", "Entries are already locked.");
  const now = Date.now();
  if (now < candleOpenMs(row.marketDate))
    throw new EngineError("TOO_EARLY", "Entries close when the target UTC candle begins.");
  if (now >= candleCloseMs(row.marketDate))
    throw new EngineError("READY_TO_RESOLVE", "The candle is complete; request settlement instead.");

  await store.updateMarket(marketId, { status: "LOCKED" });
  await store.log({ kind: "ENTRIES_CLOSED", marketId, address: address.toLowerCase(), data: {} });
  return toMarketView((await store.getMarket(marketId))!, await getPools(marketId));
}

/** resolve_market(market_id) — permissionless, two-source validator consensus. */
export async function resolveMarket(address: string, marketId: number) {
  if (!isAddress(address)) throw new EngineError("INVALID_SENDER", "Connect a wallet first.");
  const store = getStore();
  const row = await store.getMarket(marketId);
  if (!row) throw new EngineError("MARKET_NOT_FOUND", "Market not found.");
  if (row.status === "RESOLVED") throw new EngineError("ALREADY_RESOLVED", "Market is already resolved.");
  if (Date.now() < candleCloseMs(row.marketDate))
    throw new EngineError("CANDLE_INCOMPLETE", "The target UTC daily candle has not completed.");

  const evidence = await runConsensus(row.symbol, row.marketDate);

  const pools = await getPools(marketId);
  const winningStake = evidence.resolution === "UP" ? pools.up : evidence.resolution === "DOWN" ? pools.down : 0;
  // INCONCLUSIVE -> refund_all. A directional result with no winning-side
  // stake also follows the refund path while keeping its stored resolution.
  const refundAll = evidence.resolution === "INCONCLUSIVE" || winningStake === 0;

  await store.updateMarket(marketId, {
    status: "RESOLVED",
    resolution: evidence.resolution,
    refundAll,
    evidence,
    resolvedAt: new Date(),
  });

  await store.log({
    kind: "MARKET_RESOLVED",
    marketId,
    address: address.toLowerCase(),
    data: { resolution: evidence.resolution, refundAll, rule: evidence.rule },
  });

  return { view: toMarketView((await store.getMarket(marketId))!, await getPools(marketId)), evidence };
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

export type ClaimInfo = { kind: "PAYOUT" | "REFUND" | "NONE"; amount: number };

export async function claimInfo(marketId: number, address: string): Promise<ClaimInfo> {
  const row = await getMarketRow(marketId);
  const position = await getPosition(marketId, address);
  if (!row || !position || position.claimed) return { kind: "NONE", amount: 0 };
  if (row.status !== "RESOLVED") return { kind: "NONE", amount: 0 };

  const pools = await getPools(marketId);
  const pool = round8(pools.up + pools.down);

  if (row.refundAll) return { kind: "REFUND", amount: position.stake };
  const resolution = row.resolution as Side;
  if (position.side !== resolution) return { kind: "NONE", amount: 0 };
  const winning = resolution === "UP" ? pools.up : pools.down;
  if (winning <= 0) return { kind: "REFUND", amount: position.stake };
  return { kind: "PAYOUT", amount: round8((pool * position.stake) / winning) };
}

/** claim(market_id) — sender-bound, single-claim, marked before payout. */
export async function claim(address: string, marketId: number) {
  if (!isAddress(address)) throw new EngineError("INVALID_SENDER", "Connect a wallet first.");
  const store = getStore();
  const row = await store.getMarket(marketId);
  if (!row) throw new EngineError("MARKET_NOT_FOUND", "Market not found.");
  if (row.status !== "RESOLVED") throw new EngineError("NOT_RESOLVED", "Market is not resolved yet.");

  const owner = address.toLowerCase();
  const position = await getPosition(marketId, owner);
  if (!position) throw new EngineError("NO_POSITION", "This wallet holds no position in the market.");
  if (position.claimed) throw new EngineError("ALREADY_CLAIMED", "This position has already been claimed.");

  const info = await claimInfo(marketId, owner);
  if (info.kind === "NONE" || info.amount <= 0)
    throw new EngineError("NOTHING_TO_CLAIM", "Nothing to claim for this position.");

  // Mark claimed before the payout — a claim can succeed only once.
  await store.updatePosition(position.id, { claimed: true });
  await store.log({ kind: "CLAIMED", marketId, address: owner, data: { amount: info.amount, kind: info.kind } });

  return info;
}

/* ------------------------------------------------------------------ */
/* Portfolio, activity, stats                                          */
/* ------------------------------------------------------------------ */

export type PortfolioPosition = {
  position: PositionView;
  market: MarketView;
  claim: ClaimInfo;
};

export async function getPortfolio(address: string): Promise<{
  items: PortfolioPosition[];
  totals: { staked: number; claimable: number };
}> {
  if (!isAddress(address)) return { items: [], totals: { staked: 0, claimable: 0 } };

  const rows = await getStore().listPositionsForAddress(address.toLowerCase());

  const items: PortfolioPosition[] = [];
  let claimable = 0;
  let staked = 0;
  for (const p of rows) {
    const marketRow = await getMarketRow(p.marketId);
    if (!marketRow) continue;
    const view = toMarketView(marketRow, await getPools(p.marketId));
    const claim = await claimInfo(p.marketId, address);
    if (!p.claimed) staked = round8(staked + p.stake);
    if (claim.kind !== "NONE") claimable = round8(claimable + claim.amount);
    items.push({ position: toPositionView(p), market: view, claim });
  }

  return { items, totals: { staked, claimable } };
}

function fromActivityEntry(r: ActivityEntry): ActivityView {
  return {
    id: r.id,
    kind: r.kind as ActivityView["kind"],
    marketId: r.marketId,
    address: r.address,
    data: { ...(r.data ?? {}), symbol: r.symbol ?? undefined, marketDate: r.marketDate ?? undefined },
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listActivity(limit = 60): Promise<ActivityView[]> {
  const rows = await getStore().listActivity(limit);
  return rows.map(fromActivityEntry);
}

export async function getStats(now = Date.now()) {
  const store = getStore();
  const rows = await store.listMarkets();
  let open = 0;
  let settled = 0;
  for (const r of rows) {
    const phase = phaseOf(
      {
        status: r.status as MarketView["status"],
        resolution: r.resolution as MarketView["resolution"],
        refundAll: r.refundAll,
        marketDate: r.marketDate,
      },
      now,
    );
    if (phase === "PREDICTION_OPEN") open++;
    if (phase === "SETTLED" || phase === "REFUND") settled++;
  }

  return {
    totalMarkets: rows.length,
    openMarkets: open,
    settledMarkets: settled,
    totalStaked: await store.sumPositionStakes(),
    totalPaidOut: await store.sumClaimedPayouts(),
  };
}
