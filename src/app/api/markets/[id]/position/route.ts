import { jsonError, parseId, readBody } from "@/lib/api";
import { chainEnabled, readChainUserMarket } from "@/lib/chain";
import { claimInfo, getPosition, takePosition } from "@/lib/engine";
import { isAddress, round8 } from "@/lib/format";
import type { Side } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Chain-aware read: position, claim estimate, and remaining capacity. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const marketId = parseId(id);
    const address = new URL(req.url).searchParams.get("address") ?? "";

    if (chainEnabled() && isAddress(address)) {
      const chain = await readChainUserMarket(marketId, address).catch(() => null);
      if (chain) {
        const hasPosition = chain.side === "UP" || chain.side === "DOWN";
        const amount = round8(Number(chain.claimable) / 1e18);
        return Response.json({
          source: "chain",
          position: hasPosition
            ? { side: chain.side, stake: round8(Number(chain.stake) / 1e18), claimed: Boolean(chain.claimed) }
            : null,
          claim: { kind: amount > 0 ? (chain.claim_type === "REFUND" ? "REFUND" : "PAYOUT") : "NONE", amount },
          capacity: round8(Number(chain.remaining_capacity) / 1e18),
          result: chain.result,
        });
      }
    }

    const [position, claim] = await Promise.all([getPosition(marketId, address), claimInfo(marketId, address)]);
    return Response.json({ source: "indexer", position, claim, capacity: null });
  } catch (err) {
    return jsonError(err);
  }
}

/** take_position(market_id, side) — payable. (Local engine path; on-chain writes go through the wallet.) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readBody<{ address?: string; side?: Side; amount?: number }>(req);
    const position = await takePosition(body.address ?? "", parseId(id), body.side as Side, Number(body.amount));
    return Response.json({ position });
  } catch (err) {
    return jsonError(err);
  }
}
