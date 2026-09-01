// Unified read layer: canonical chain state first (genlayer-js views on the
// deployed contract), falling back to the local indexer store when the chain
// or RPC is unavailable. Every page reads through here so the interface
// shows real on-chain markets on Bradbury while staying operable offline.

import {
  chainEnabled,
  mapChainMarket,
  readChainEvidence,
  readChainMarket,
  readChainMarkets,
} from "./chain";
import { getPools, getStats, listMarketViews, type MarketDetail } from "./engine";
import { round8 } from "./format";
import { getStore } from "./store";
import type { MarketView, PositionView, SettlementEvidence } from "./types";

export type MarketsResult = {
  source: "chain" | "indexer";
  markets: MarketView[];
  stats: {
    totalMarkets: number;
    openMarkets: number;
    settledMarkets: number;
    totalStaked: number;
    totalPaidOut: number;
  };
};

async function mirrorCounts(): Promise<Map<string, { upN: number; downN: number }>> {
  const counts = new Map<string, { upN: number; downN: number }>();
  try {
    const rows = await getStore().listMarkets();
    for (const row of rows) {
      const pools = await getPools(row.id);
      if (pools.upN + pools.downN > 0) {
        counts.set(`${row.symbol}|${row.marketDate}`, { upN: pools.upN, downN: pools.downN });
      }
    }
  } catch {
    /* counts are observational only */
  }
  return counts;
}

export async function getMarketsUnified(now = Date.now()): Promise<MarketsResult> {
  if (chainEnabled()) {
    try {
      const [chainRows, counts] = await Promise.all([readChainMarkets(), mirrorCounts()]);
      const markets = chainRows
        .map((m) => mapChainMarket(m, counts.get(`${m.symbol}|${m.market_date}`)))
        .sort((a, b) => a.candleOpenMs - b.candleOpenMs || a.id - b.id);
      let openMarkets = 0;
      let settledMarkets = 0;
      let totalStaked = 0;
      let totalPaidOut = 0;
      for (const m of chainRows) {
        if (m.phase === "PREDICTION_OPEN") openMarkets++;
        if (m.phase === "SETTLED" || m.phase === "REFUND") settledMarkets++;
        totalStaked = round8(totalStaked + Number(m.pool) / 1e18);
        totalPaidOut = round8(totalPaidOut + Number(m.paid_out) / 1e18);
      }
      return {
        source: "chain",
        markets,
        stats: { totalMarkets: markets.length, openMarkets, settledMarkets, totalStaked, totalPaidOut },
      };
    } catch {
      /* fall through to the indexer */
    }
  }

  const [markets, stats] = await Promise.all([listMarketViews(now), getStats(now)]);
  return { source: "indexer", markets, stats };
}

export type UnifiedDetail = {
  source: "chain" | "indexer";
  view: MarketView;
  evidence: SettlementEvidence | null;
  positions: PositionView[];
  mirrorOnly: boolean;
};

export async function getMarketDetailUnified(id: number, now = Date.now()): Promise<UnifiedDetail | null> {
  if (chainEnabled()) {
    try {
      const row = await readChainMarket(id);
      if (row) {
        // Mirror positions keyed by (symbol, marketDate) — chain ids are how
        // the chain addresses a market; the mirror keys on the same identity.
        const store = getStore();
        const mirrorMarket = await store.findMarket(row.symbol, row.market_date).catch(() => null);
        const mirrorPositions = mirrorMarket ? await store.listPositions(mirrorMarket.id).catch(() => []) : [];
        const pools = mirrorMarket
          ? await getPools(mirrorMarket.id).catch(() => ({ up: 0, down: 0, upN: 0, downN: 0 }))
          : { up: 0, down: 0, upN: 0, downN: 0 };
        const view = mapChainMarket(row, { upN: pools.upN, downN: pools.downN });
        const evidence = row.evidence_available ? await readChainEvidence(id) : null;
        return {
          source: "chain",
          view,
          evidence,
          positions: mirrorPositions.map((p) => ({
            id: p.id,
            marketId: id,
            address: p.address,
            side: p.side as PositionView["side"],
            stake: p.stake,
            claimed: p.claimed,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          })),
          mirrorOnly: false,
        };
      }
    } catch {
      /* fall through to the indexer */
    }
  }

  const detail: MarketDetail | null = await import("./engine").then((m) => m.getMarketDetail(id, now));
  if (!detail) return null;
  return { source: "indexer", view: detail.view, evidence: detail.evidence, positions: detail.positions, mirrorOnly: false };
}
