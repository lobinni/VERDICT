import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { OutcomeChip, PhaseBadge } from "@/components/phase-badge";
import { PoolBar } from "@/components/pool-bar";
import { fmtGen } from "@/lib/format";
import { nextMilestone } from "@/lib/time";
import type { MarketView } from "@/lib/types";

export function MarketCard({ market }: { market: MarketView }) {
  const milestone = nextMilestone(market);
  const settled = market.phase === "SETTLED" || market.phase === "REFUND";

  return (
    <Link
      href={`/market/${market.id}`}
      className="group glass glass-hover relative flex flex-col rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-ink-900 font-mono text-sm font-bold text-glow">
            {market.ticker}
          </span>
          <div>
            <div className="text-[15px] font-semibold text-paper">{market.name}</div>
            <div className="font-mono text-[11px] tracking-wider text-faint">
              {market.symbol} · {market.marketDate}
            </div>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-glow" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <PhaseBadge phase={market.phase} size="sm" />
        {settled && <OutcomeChip resolution={market.resolution} refundAll={market.refundAll} size="sm" />}
      </div>

      <div className="mt-4">
        <PoolBar upPool={market.upPool} downPool={market.downPool} />
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-line-soft/70 pt-4">
        <div>
          <div className="text-[10px] font-medium tracking-[0.2em] text-faint uppercase">Total pool</div>
          <div className="font-mono text-lg font-bold text-paper tabular">
            {fmtGen(market.totalPool, 2)} <span className="text-xs font-normal text-faint">GEN</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium tracking-[0.2em] text-faint uppercase">{milestone.label}</div>
          <Countdown
            targetMs={milestone.atMs}
            className="font-mono text-sm font-semibold text-glow"
          />
        </div>
      </div>
    </Link>
  );
}
