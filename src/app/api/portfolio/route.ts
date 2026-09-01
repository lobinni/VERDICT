import { jsonError } from "@/lib/api";
import { chainEnabled, readChainUserPositions, type ChainPortfolioRow } from "@/lib/chain";
import { getPortfolio } from "@/lib/engine";
import { symbolMeta } from "@/lib/constants";
import { round8 } from "@/lib/format";
import { candleCloseMs, candleOpenMs } from "@/lib/time";
import type { MarketView } from "@/lib/types";

export const dynamic = "force-dynamic";

function chainRowToMarketView(r: ChainPortfolioRow, now: number): MarketView {
  const meta = symbolMeta(r.symbol);
  return {
    id: r.market_id,
    symbol: r.symbol,
    ticker: meta?.ticker ?? r.symbol,
    name: r.name || meta?.name || r.symbol,
    marketDate: r.market_date,
    status: (r.state as MarketView["status"]) ?? "OPEN",
    resolution: r.state === "RESOLVED" && r.resolution !== "NONE" ? (r.resolution as MarketView["resolution"]) : null,
    refundAll: r.result === "REFUND_AVAILABLE",
    phase: r.phase as MarketView["phase"],
    candleOpenMs: candleOpenMs(r.market_date),
    candleCloseMs: candleCloseMs(r.market_date),
    upPool: 0,
    downPool: 0,
    totalPool: 0,
    upPositions: 0,
    downPositions: 0,
    positionCount: 0,
    createdBy: "",
    createdAt: new Date(now).toISOString(),
    resolvedAt: "",
  };
}

export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get("address") ?? "";
    if (chainEnabled() && address) {
      const rows = await readChainUserPositions(address).catch(() => null);
      if (rows) {
        const now = Date.now();
        const items = rows.map((r, i) => {
          const stake = round8(Number(r.stake) / 1e18);
          const claimable = round8(Number(r.claimable) / 1e18);
          return {
            position: {
              id: i + 1,
              marketId: r.market_id,
              address,
              side: r.side as "UP" | "DOWN",
              stake,
              claimed: Boolean(r.claimed),
            },
            market: chainRowToMarketView(r, now),
            claim: {
              kind: (claimable > 0 ? (r.result === "REFUND_AVAILABLE" ? "REFUND" : "PAYOUT") : "NONE") as
                | "PAYOUT"
                | "REFUND"
                | "NONE",
              amount: claimable,
            },
          };
        });
        const totals = items.reduce(
          (acc, it) => ({
            staked: round8(acc.staked + (it.position.claimed ? 0 : it.position.stake)),
            claimable: round8(acc.claimable + (it.claim.kind === "NONE" ? 0 : it.claim.amount)),
          }),
          { staked: 0, claimable: 0 },
        );
        return Response.json({ source: "chain", items, totals });
      }
    }
    return Response.json({ source: "indexer", ...(await getPortfolio(address)) });
  } catch (err) {
    return jsonError(err);
  }
}
