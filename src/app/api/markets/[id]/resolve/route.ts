import { jsonError, parseId, readBody } from "@/lib/api";
import { resolveMarket } from "@/lib/engine";

export const dynamic = "force-dynamic";

/** resolve_market(market_id) — triggers two-source validator consensus. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readBody<{ address?: string }>(req);
    const result = await resolveMarket(body.address ?? "", parseId(id));
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
