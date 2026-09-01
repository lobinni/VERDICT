import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Coins,
  Gavel,
  Hourglass,
  Loader,
  Lock,
  TrendingDown,
  TrendingUp,
  Vote,
} from "lucide-react";
import { Countdown } from "@/components/countdown";
import { EvidencePanel } from "@/components/evidence-panel";
import { LivePriceChart } from "@/components/live-price-chart";
import { MarketActions } from "@/components/market-actions";
import { OutcomeChip, PhaseBadge } from "@/components/phase-badge";
import { PoolBar } from "@/components/pool-bar";
import { getMarketDetailUnified } from "@/lib/unified";
import { getLiveCandles, getLiveQuote } from "@/lib/quotes";
import { fmtGen, shortAddr } from "@/lib/format";
import { formatUtc, nextMilestone } from "@/lib/time";
import { DatabaseNotConfiguredError, isDatabaseError } from "@/db";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId) || marketId < 0) notFound();

  let detail: Awaited<ReturnType<typeof getMarketDetailUnified>>;
  try {
    detail = await getMarketDetailUnified(marketId);
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) return <SetupNotice />;
    if (isDatabaseError(err)) return <SetupNotice problem="unreachable" />;
    throw err;
  }
  if (!detail) notFound();

  const { view, evidence, positions, source } = detail;
  const milestone = nextMilestone(view);
  const resolved = view.phase === "SETTLED" || view.phase === "REFUND";

  // Real exchange data only: initial quote + daily candles from the first
  // trusted venue; the client keeps both streaming live afterwards.
  const [initialQuote, initialChart] = await Promise.all([
    getLiveQuote(view.symbol),
    getLiveCandles(view.symbol),
  ]);

  const now = Date.now();
  const timeline = [
    {
      Icon: Gavel,
      label: source === "chain" ? "Deployed on-chain" : "Market created",
      at: view.createdAt ? formatUtc(new Date(view.createdAt)) : "recorded in contract storage",
      state: "done" as const,
      note: view.createdBy ? `by ${shortAddr(view.createdBy)}` : "canonical state on Bradbury",
    },
    {
      Icon: Lock,
      label: "Entries close",
      at: formatUtc(view.candleOpenMs),
      state: now >= view.candleOpenMs ? ("done" as const) : ("current" as const),
      note: "target UTC candle begins",
    },
    {
      Icon: Hourglass,
      label: "Candle completes",
      at: formatUtc(view.candleCloseMs),
      state: now >= view.candleCloseMs ? ("done" as const) : now >= view.candleOpenMs ? ("current" as const) : ("pending" as const),
      note: "00:00 UTC next day",
    },
    {
      Icon: Vote,
      label: "Validator consensus",
      at: view.resolvedAt ? formatUtc(new Date(view.resolvedAt)) : "awaiting resolve_market call",
      state: resolved ? ("done" as const) : now >= view.candleCloseMs ? ("current" as const) : ("pending" as const),
      note: resolved ? evidence?.rule ?? "" : "Binance × Bitget equivalence",
    },
    {
      Icon: Coins,
      label: "Claims & refunds",
      at: resolved ? "open" : "locked",
      state: resolved ? ("current" as const) : ("pending" as const),
      note: view.refundAll ? "all stakes refundable" : "proportional pool payouts",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-fade transition-colors hover:text-paper"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All markets
      </Link>

      {/* header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-ink-900 font-mono text-lg font-bold text-glow">
            {view.ticker}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-paper sm:text-3xl">
              {view.name} <span className="text-faint">·</span>{" "}
              <span className="text-iridescent">{view.marketDate}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PhaseBadge phase={view.phase} size="sm" />
              {resolved && <OutcomeChip resolution={view.resolution} refundAll={view.refundAll} size="sm" />}
              <span className="font-mono text-[11px] text-faint">{view.symbol} · market #{view.id}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl px-5 py-3.5 text-right">
          <div className="text-[10px] font-medium tracking-[0.22em] text-faint uppercase">{milestone.label}</div>
          <Countdown targetMs={milestone.atMs} className="font-mono text-2xl font-bold text-glow" />
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_370px]">
        {/* left column */}
        <div className="space-y-5">
          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-paper">Live daily candles</h3>
              <span className="text-[10px] font-medium tracking-wide text-faint">real exchange data · refreshes live</span>
            </div>
            <LivePriceChart
              symbol={view.symbol}
              marketDate={view.marketDate}
              initialQuote={initialQuote}
              initialChart={initialChart}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Charts are display-only context. Settlement evidence from Binance USD-M and Bitget
              USDT futures is the sole source the verdict uses.
            </p>
          </div>

          {evidence && <EvidencePanel evidence={evidence} refundAll={view.refundAll} />}

          {/* positions table */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-paper">Positions</h3>
              <span className="text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
                {positions.length} observed
              </span>
            </div>
            {positions.length === 0 ? (
              <p className="mt-4 rounded-xl border border-line-soft bg-ink-900/40 px-4 py-6 text-center text-xs text-fade">
                No positions observed yet
                {source === "chain" ? " — new positions appear here right after MetaMask confirmation" : ". Be the first contrarian."}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line-soft text-[10px] tracking-[0.18em] text-faint uppercase">
                      <th className="py-2 pr-4 font-medium">Wallet</th>
                      <th className="py-2 pr-4 font-medium">Side</th>
                      <th className="py-2 pr-4 text-right font-medium">Stake</th>
                      <th className="py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {positions.map((p) => (
                      <tr key={p.id} className="border-b border-line-soft/50 last:border-0">
                        <td className="py-2.5 pr-4 text-fade">{shortAddr(p.address)}</td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              p.side === "UP" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                            }`}
                          >
                            {p.side === "UP" ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {p.side}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-paper tabular">
                          {fmtGen(p.stake)} GEN
                        </td>
                        <td className="py-2.5 text-right text-faint">
                          {p.claimed ? "claimed" : view.refundAll && resolved ? "refundable" : "open"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* right column */}
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <MarketActions market={view} />

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-paper">Pools</h3>
              <span className="font-mono text-xs text-fade tabular">
                {fmtGen(view.totalPool, 2)} GEN total
              </span>
            </div>
            <PoolBar upPool={view.upPool} downPool={view.downPool} height="h-3" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-up/25 bg-up/5 px-3 py-2.5">
                <div className="font-mono text-sm font-bold text-up tabular">{fmtGen(view.upPool, 2)} GEN</div>
                <div className="text-[10px] tracking-widest text-faint uppercase">
                  {view.upPositions > 0 ? `${view.upPositions} on UP` : "UP pool"}
                </div>
              </div>
              <div className="rounded-xl border border-down/25 bg-down/5 px-3 py-2.5">
                <div className="font-mono text-sm font-bold text-down tabular">{fmtGen(view.downPool, 2)} GEN</div>
                <div className="text-[10px] tracking-widest text-faint uppercase">
                  {view.downPositions > 0 ? `${view.downPositions} on DOWN` : "DOWN pool"}
                </div>
              </div>
            </div>
            {resolved && !view.refundAll && (
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Winners split the full pool proportionally:
                <span className="ml-1 font-mono text-[10px] text-fade">
                  payout = pool × stake ÷ winning-side stake
                </span>
              </p>
            )}
          </div>

          {/* timeline */}
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-4 text-sm font-semibold text-paper">Lifecycle</h3>
            <ol className="relative space-y-4 border-l border-line-soft pl-5">
              {timeline.map((t) => (
                <li key={t.label} className="relative">
                  <span className="absolute top-0.5 -left-[27px] flex h-4 w-4 items-center justify-center rounded-full bg-ink-950">
                    {t.state === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-up" />
                    ) : t.state === "current" ? (
                      <Loader className="h-4 w-4 animate-spin-slow text-glow" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-line" />
                    )}
                  </span>
                  <div className={`text-[13px] font-semibold ${t.state === "pending" ? "text-faint" : "text-paper"}`}>
                    {t.label}
                  </div>
                  <div className="font-mono text-[10px] text-faint">{t.at}</div>
                  {t.note && <div className="text-[10px] text-faint">{t.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
