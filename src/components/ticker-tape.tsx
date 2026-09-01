import { fmtGen } from "@/lib/format";
import type { MarketView } from "@/lib/types";

/**
 * Scrolling strip of REAL protocol and market facts — never price data
 * invented for decoration.
 */
export function TickerTape({ markets }: { markets: MarketView[] }) {
  const facts = markets.length
    ? markets.map((m) => `${m.ticker} · ${m.marketDate} · ${fmtGen(m.totalPool, 2)} GEN staked`)
    : [
        "Five validators per settlement round",
        "Two locked sources: Binance USD-M and Bitget USDT futures",
        "Minimum stake 1 GEN — maximum 10 GEN per market",
        "Permissionless market creation",
        "Inconclusive evidence refunds every stake",
      ];

  return (
    <div className="relative border-y border-line-soft/70 bg-ink-900/50 py-3 backdrop-blur">
      <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap">
        {[0, 1].map((half) => (
          <div key={half} className="flex items-center gap-10">
            {facts.map((f, i) => (
              <span key={`${half}-${i}`} className="flex items-center gap-2.5 text-xs text-fade">
                <span className="h-1 w-1 rounded-full bg-glow/60" />
                {f}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  );
}
