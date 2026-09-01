import { jsonError, parseId } from "@/lib/api";
import { EngineError, getMarketDetail } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const detail = await getMarketDetail(parseId(id));
    if (!detail) throw new EngineError("MARKET_NOT_FOUND", "Market not found.");
    return Response.json(detail);
  } catch (err) {
    return jsonError(err);
  }
}
