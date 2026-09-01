import { jsonError, readBody } from "@/lib/api";
import { listMarketViews, openMarket } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ markets: await listMarketViews() });
  } catch (err) {
    return jsonError(err);
  }
}

/** open_market(symbol, market_date) */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ address?: string; symbol?: string; marketDate?: string }>(req);
    const view = await openMarket(body.address ?? "", body.symbol ?? "", body.marketDate ?? "");
    return Response.json({ market: view }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
