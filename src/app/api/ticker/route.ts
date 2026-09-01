import { jsonError } from "@/lib/api";
import { isSupportedSymbol } from "@/lib/constants";
import { getLiveQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

/** Live quote from the first trusted venue (Binance → Bitget → OKX → Gate). */
export async function GET(req: Request) {
  try {
    const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
    if (!isSupportedSymbol(symbol)) {
      return Response.json({ error: "Unsupported symbol", code: "UNSUPPORTED_SYMBOL" }, { status: 400 });
    }
    const quote = await getLiveQuote(symbol);
    return Response.json({ quote });
  } catch (err) {
    return jsonError(err);
  }
}
