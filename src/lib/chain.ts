// On-chain read layer — the canonical data source.
//
// The deployed Verdict Intelligent Contract on GenLayer Bradbury IS the
// system of record. This module reads its view methods over genlayer-js and
// maps them onto the interface types, converting wei (1e18) and fixed-point
// prices (1e8) to display units. When the contract or RPC is unreachable,
// callers fall back to the local indexer store so the interface degrades
// gracefully instead of breaking.

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { NETWORK, symbolMeta } from "./constants";
import { round8 } from "./format";
import type { MarketView, SettlementEvidence, SourceEvidence, ValidatorVote } from "./types";

const WEI = 1e18;
const PRICE_FP = 1e8;

export function chainEnabled(): boolean {
  return NETWORK.contract.startsWith("0x") && NETWORK.contract.length === 42;
}

type ReadClient = ReturnType<typeof createClient>;
const globalForChain = globalThis as typeof globalThis & { __verdictChainClient?: ReadClient };

function client(): ReadClient {
  if (!globalForChain.__verdictChainClient) {
    globalForChain.__verdictChainClient = createClient({ chain: testnetBradbury });
  }
  return globalForChain.__verdictChainClient;
}

const contract = () => NETWORK.contract as `0x${string}`;

async function view<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const result = await client().readContract({
    address: contract(),
    functionName,
    args: args as never,
  });
  return result as T;
}

function gen(wei: unknown): number {
  return round8(Number(wei) / WEI);
}

/* ------------------------------------------------------------------ */
/* Market mapping                                                      */
/* ------------------------------------------------------------------ */

export type ChainMarketView = {
  market_id: number;
  symbol: string;
  name: string;
  market_date: string;
  expected_candle_timestamp: number;
  opens_at: number;
  settles_at: number;
  state: string;
  phase: string;
  resolution: string;
  up_total: number;
  down_total: number;
  pool: number;
  paid_out: number;
  refund_all: boolean;
  entries_open: boolean;
  settlement_eligible: boolean;
  evidence_available: boolean;
};

export function mapChainMarket(m: ChainMarketView, mirror?: { upN: number; downN: number }): MarketView {
  const resolved = m.state === "RESOLVED";
  const meta = symbolMeta(m.symbol);
  return {
    id: m.market_id,
    symbol: m.symbol,
    ticker: meta?.ticker ?? m.symbol,
    name: m.name || meta?.name || m.symbol,
    marketDate: m.market_date,
    status: m.state as MarketView["status"],
    resolution: resolved && m.resolution !== "NONE" ? (m.resolution as MarketView["resolution"]) : null,
    refundAll: Boolean(m.refund_all),
    phase: m.phase as MarketView["phase"],
    candleOpenMs: Number(m.opens_at) * 1000,
    candleCloseMs: Number(m.settles_at) * 1000,
    upPool: gen(m.up_total),
    downPool: gen(m.down_total),
    totalPool: gen(m.pool),
    upPositions: mirror?.upN ?? 0,
    downPositions: mirror?.downN ?? 0,
    positionCount: (mirror?.upN ?? 0) + (mirror?.downN ?? 0),
    createdBy: "",
    createdAt: "",
    resolvedAt: "",
  };
}

export async function readChainMarkets(): Promise<ChainMarketView[]> {
  const out: ChainMarketView[] = [];
  let offset = 0;
  for (let page = 0; page < 4; page++) {
    const res = await view<{ markets?: ChainMarketView[]; has_more?: boolean; next_offset?: number }>(
      "get_markets",
      [offset, 50],
    );
    out.push(...(res.markets ?? []));
    if (!res.has_more) break;
    offset = Number(res.next_offset ?? offset + 50);
  }
  return out;
}

export async function readChainMarket(marketId: number): Promise<ChainMarketView | null> {
  try {
    return await view<ChainMarketView>("get_market", [marketId]);
  } catch {
    return null; // contract raises "[EXPECTED] market not found"
  }
}

/* ------------------------------------------------------------------ */
/* User position / claims                                              */
/* ------------------------------------------------------------------ */

export type ChainUserMarket = {
  market_id: number;
  wallet: string;
  side: string;
  stake: number;
  claimed: boolean;
  claimable: number;
  remaining_capacity: number;
  result: string;
  claim_type: string;
};

export async function readChainUserMarket(marketId: number, wallet: string): Promise<ChainUserMarket | null> {
  try {
    return await view<ChainUserMarket>("get_user_market", [marketId, wallet]);
  } catch {
    return null;
  }
}

export type ChainPortfolioRow = {
  market_id: number;
  symbol: string;
  name: string;
  market_date: string;
  side: string;
  stake: number;
  state: string;
  phase: string;
  resolution: string;
  result: string;
  claimable: number;
  claimed: boolean;
};

export async function readChainUserPositions(wallet: string): Promise<ChainPortfolioRow[]> {
  const out: ChainPortfolioRow[] = [];
  let offset = 0;
  for (let page = 0; page < 4; page++) {
    const res = await view<{ positions?: ChainPortfolioRow[]; has_more?: boolean; next_offset?: number }>(
      "get_user_positions",
      [wallet, offset, 50],
    );
    out.push(...(res.positions ?? []));
    if (!res.has_more) break;
    offset = Number(res.next_offset ?? offset + 50);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Settlement evidence (on-chain record)                               */
/* ------------------------------------------------------------------ */

type ChainEvidence = {
  market_id: number;
  symbol: string;
  market_date: string;
  expected_candle_timestamp: number;
  binance_timestamp: number;
  binance_open: number;
  binance_close: number;
  binance_direction: string;
  binance_status: string;
  bitget_timestamp: number;
  bitget_open: number;
  bitget_close: number;
  bitget_direction: string;
  bitget_status: string;
  resolution: string;
  recorded_at: string;
};

function mapSource(
  source: "BINANCE" | "BITGET",
  ts: number,
  openFp: number,
  closeFp: number,
  direction: string,
  status: string,
  expectedOpenMs: number,
): SourceEvidence {
  const ok = status === "VALID" && direction !== "INCONCLUSIVE";
  return {
    source,
    endpoint: "",
    params: {},
    status: ok ? "OK" : "ERROR",
    reason: ok ? null : status,
    candleOpenMs: ok ? Number(ts) : null,
    candleCloseMs: ok ? Number(ts) + 86_399_999 : null,
    open: ok ? round8(Number(openFp) / PRICE_FP) : null,
    close: ok ? round8(Number(closeFp) / PRICE_FP) : null,
    direction: ok && direction !== "INCONCLUSIVE" ? (direction as SourceEvidence["direction"]) : "NONE",
  } satisfies SourceEvidence;
}

export async function readChainEvidence(marketId: number): Promise<SettlementEvidence | null> {
  try {
    const e = await view<ChainEvidence>("get_settlement_evidence", [marketId]);
    const expectedOpenMs = Number(e.expected_candle_timestamp);
    const binance = mapSource("BINANCE", e.binance_timestamp, e.binance_open, e.binance_close, e.binance_direction, e.binance_status, expectedOpenMs);
    const bitget = mapSource("BITGET", e.bitget_timestamp, e.bitget_open, e.bitget_close, e.bitget_direction, e.bitget_status, expectedOpenMs);
    const validators: ValidatorVote[] = [];
    return {
      symbol: e.symbol,
      marketDate: e.market_date,
      expectedCandleOpenMs: expectedOpenMs,
      expectedCandleCloseMs: expectedOpenMs + 86_400_000,
      binance,
      bitget,
      resolution: e.resolution as SettlementEvidence["resolution"],
      rule: `${binance.direction}+${bitget.direction} => ${e.resolution}`,
      validators,
      consensusReached: true,
      settledAtMs: Date.parse(e.recorded_at) || 0,
    };
  } catch {
    return null;
  }
}
