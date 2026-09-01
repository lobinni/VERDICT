import Link from "next/link";
import { ArrowDown, ArrowRight, Gavel, Globe2, Scale, Users, Vote, Zap } from "lucide-react";
import { HeroCandles } from "@/components/hero-candles";
import { MarketCard } from "@/components/market-card";
import { SetupNotice } from "@/components/setup-notice";
import { TickerTape } from "@/components/ticker-tape";
import { DatabaseNotConfiguredError, isDatabaseError } from "@/db";
import { VALIDATOR_COUNT } from "@/lib/constants";
import { getMarketsUnified } from "@/lib/unified";
import { fmtGen } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <div className="text-[10px] font-medium tracking-[0.22em] text-faint uppercase">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold text-paper tabular">
        {value}
        {suffix && <span className="ml-1.5 text-sm font-normal text-fade">{suffix}</span>}
      </div>
    </div>
  );
}

function SectionHeading({ title, hint, count }: { title: string; hint: string; count: number }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl font-bold text-paper">{title}</h2>
        <span className="font-mono text-xs text-faint tabular">{count}</span>
      </div>
      <span className="hidden text-xs text-faint sm:block">{hint}</span>
    </div>
  );
}

export default async function MarketsPage() {
  let source: "chain" | "indexer" = "indexer";
  let markets: Awaited<ReturnType<typeof getMarketsUnified>>["markets"];
  let stats: Awaited<ReturnType<typeof getMarketsUnified>>["stats"];
  try {
    const unified = await getMarketsUnified();
    source = unified.source;
    markets = unified.markets;
    stats = unified.stats;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) return <SetupNotice />;
    if (isDatabaseError(err)) return <SetupNotice problem="unreachable" />;
    throw err;
  }

  const open = markets.filter((m) => m.phase === "PREDICTION_OPEN");
  const live = markets.filter((m) => m.phase === "CANDLE_IN_PROGRESS" || m.phase === "READY_TO_RESOLVE");
  const settled = [...markets.filter((m) => m.phase === "SETTLED" || m.phase === "REFUND")].reverse();

  return (
    <div>
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-glow/30 bg-glow/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.22em] text-glow uppercase">
                <Gavel className="h-3.5 w-3.5" />
                Intelligent Contract · Bradbury Testnet
              </div>
              {source === "chain" && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-up/30 bg-up/10 px-3 py-1.5 text-[11px] font-semibold text-up">
                  <Zap className="h-3.5 w-3.5" />
                  Live from the deployed contract
                </div>
              )}
            </div>
            <h1 className="mt-6 text-5xl leading-[0.98] font-bold tracking-tight text-paper sm:text-6xl lg:text-7xl">
              THE COURT
              <br />
              <span className="text-iridescent">RULES ON PRICE.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-fade">
              Stake GEN on whether a futures pair&apos;s target UTC daily candle closes{" "}
              <span className="font-semibold text-up">UP</span> or{" "}
              <span className="font-semibold text-down">DOWN</span>. When the candle completes,
              GenLayer validators independently fetch locked Binance × Bitget evidence and reach
              agreement through the Equivalence Principle — no oracle, no admin, no appeal to a
              louder voice.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#markets"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-glow-deep to-glow px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(139,124,255,0.9)] transition-transform hover:scale-[1.03] active:scale-95"
              >
                Explore markets
                <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
              </a>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-900/60 px-6 py-3 text-sm font-semibold text-paper transition-colors hover:border-glow/50 hover:text-glow"
              >
                How consensus works
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                { Icon: Vote, top: `${VALIDATOR_COUNT} validators`, bottom: "Optimistic Democracy" },
                { Icon: Globe2, top: "2 sources", bottom: "Binance × Bitget" },
                { Icon: Scale, top: "Equivalence", bottom: "strict equality" },
              ].map(({ Icon, top, bottom }) => (
                <div key={top} className="rounded-xl border border-line-soft bg-ink-900/50 px-3.5 py-3">
                  <Icon className="h-4 w-4 text-glow" />
                  <div className="mt-2 text-[13px] font-semibold text-paper">{top}</div>
                  <div className="text-[10px] tracking-wide text-faint uppercase">{bottom}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="glass relative h-[380px] overflow-hidden rounded-3xl sm:h-[430px]">
              <div className="absolute top-4 left-5 z-10 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-up text-up animate-pulse-dot" />
                <span className="font-mono text-[10px] tracking-[0.3em] text-fade uppercase">
                  Settlement engine visual
                </span>
              </div>
              <div className="absolute top-4 right-5 z-10 rounded-full border border-line bg-ink-950/70 px-3 py-1 font-mono text-[10px] tracking-widest text-glow">
                {VALIDATOR_COUNT}-OF-{VALIDATOR_COUNT} VOTES
              </div>
              <HeroCandles />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />
            </div>
            <div className="glass absolute -bottom-5 left-6 flex items-center gap-3 rounded-2xl px-4 py-3 animate-float">
              <Users className="h-4 w-4 text-up" />
              <div>
                <div className="font-mono text-sm font-bold text-paper tabular">
                  {fmtGen(stats.totalStaked, 2)} GEN
                </div>
                <div className="text-[10px] tracking-[0.2em] text-faint uppercase">staked by the crowd</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <TickerTape markets={markets} />

      {/* ------------------------------ STATS ----------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Markets total" value={String(stats.totalMarkets)} />
          <Stat label="Open for predictions" value={String(stats.openMarkets)} />
          <Stat label="GEN staked" value={fmtGen(stats.totalStaked, 2)} suffix="GEN" />
          <Stat label="GEN paid out" value={fmtGen(stats.totalPaidOut, 2)} suffix="GEN" />
        </div>
      </section>

      {/* ----------------------------- MARKETS ---------------------------- */}
      <section id="markets" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-6 sm:px-6">
        {live.length > 0 && (
          <div className="mb-12">
            <SectionHeading
              title="Live & Awaiting Consensus"
              hint="Candles in progress or ready for validator settlement"
              count={live.length}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>
          </div>
        )}

        <div className="mb-12">
          <SectionHeading
            title="Open for Predictions"
            hint="Stake 1–10 GEN before the target UTC candle begins"
            count={open.length}
          />
          {open.length === 0 ? (
            <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-fade">
              No open markets right now —{" "}
              <Link href="/create" className="text-glow underline underline-offset-4">
                create one permissionlessly
              </Link>
              .
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>
          )}
        </div>

        {settled.length > 0 && (
          <div>
            <SectionHeading
              title="Settled by the Court"
              hint="Resolved through two-source validator consensus"
              count={settled.length}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {settled.map((m) => (
                <MarketCard key={m.id} market={m} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
