import { jsonError, parseId, readBody } from "@/lib/api";
import { claim, claimInfo } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const address = new URL(req.url).searchParams.get("address") ?? "";
    return Response.json({ claim: await claimInfo(parseId(id), address) });
  } catch (err) {
    return jsonError(err);
  }
}

/** claim(market_id) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readBody<{ address?: string }>(req);
    const info = await claim(body.address ?? "", parseId(id));
    return Response.json({ claim: info });
  } catch (err) {
    return jsonError(err);
  }
}
