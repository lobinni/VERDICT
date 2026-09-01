import { jsonError, parseId, readBody } from "@/lib/api";
import { closeEntries } from "@/lib/engine";

export const dynamic = "force-dynamic";

/** close_entries(market_id) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readBody<{ address?: string }>(req);
    const market = await closeEntries(body.address ?? "", parseId(id));
    return Response.json({ market });
  } catch (err) {
    return jsonError(err);
  }
}
