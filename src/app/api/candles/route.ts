import { jsonError } from "@/lib/api";
import { isSupportedSymbol } from "@/lib/constants";
import { getLiveCandles } from "@/lib/quotes";

export const dynamic = "force-dynamic";

/** Real daily candles from the first trusted venue. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") ?? "";
    if (!isSupportedSymbol(symbol)) {
      return Response.json({ error: "Unsupported symbol", code: "UNSUPPORTED_SYMBOL" }, { status: 400 });
    }
    const result = await getLiveCandles(symbol, url.searchParams.get("limit") === "80" ? 80 : 40);
    return Response.json({ chart: result });
  } catch (err) {
    return jsonError(err);
  }
}
