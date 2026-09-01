"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  Loader2,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/client-api";
import { fmtGen, shortAddr } from "@/lib/format";
import type { MarketView, PositionView, Side } from "@/lib/types";
import { useWallet } from "@/components/wallet-provider";
import { OutcomeChip, PhaseBadge } from "@/components/phase-badge";

type Item = {
  position: PositionView;
  market: MarketView;
  claim: { kind: "PAYOUT" | "REFUND" | "NONE"; amount: number };
};

type PortfolioResponse = {
  items: Item[];
  totals: { staked: number; claimable: number };
};

export default function PortfolioPage() {
  const { address, hydrated, connecting, hasMetaMask, balanceGen, connect, refresh } = useWallet();
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setData(await apiGet<PortfolioResponse>(`/api/portfolio?address=${encodeURIComponent(address)}`));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) void load();
    else setData(null);
  }, [address, load]);

  const claim = async (marketId: number) => {
    if (!address) return;
    setBusyId(marketId);
    setFeedback(null);
    try {
      const res = await apiPost<{ claim: { amount: number; kind: string } }>(
        `/api/markets/${marketId}/claim`,
        { address },
      );
      setFeedback({ ok: true, text: `Claimed ${fmtGen(res.claim.amount)} GEN (${res.claim.kind.toLowerCase()}).` });
      await Promise.all([refresh(), load()]);
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "Claim failed" });
    } finally {
      setBusyId(null);
    }
  };

  if (!hydrated) {
    return <div className="mx-auto max-w-5xl px-4 pt-16 sm:px-6"><div className="glass h-40 animate-pulse rounded-3xl" /></div>;
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-20 pb-10 text-center sm:px-6">
        <div className="glass mx-auto flex max-w-md flex-col items-center rounded-3xl px-8 py-12">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-glow/30 bg-glow/10">
            <Wallet className="h-6 w-6 text-glow" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-paper">Connect MetaMask</h1>
          <p className="mt-2 text-sm leading-relaxed text-fade">
            Portfolio is sender-bound: positions, claims and refunds are indexed by the address you
            connect. Only a MetaMask wallet can participate — there are no demo or custodial
            balances.
          </p>
          <button
            onClick={() => void connect()}
            disabled={connecting || !hasMetaMask}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-glow-deep to-glow px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(139,124,255,0.9)] transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-60"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
            {hasMetaMask ? "Connect MetaMask" : "MetaMask not detected"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-paper">Portfolio</h1>
          <p className="mt-1 font-mono text-xs text-fade">{shortAddr(address, 10, 8)}</p>
        </div>
        <div className="font-mono text-xs text-faint">
          {loading ? "syncing contract state…" : `${data?.items.length ?? 0} positions`}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "On-chain balance", text: balanceGen ?? "—", suffix: "GEN" },
          { label: "Currently staked", text: fmtGen(data?.totals.staked ?? 0, 2), suffix: "GEN" },
          { label: "Claimable now", text: fmtGen(data?.totals.claimable ?? 0, 2), suffix: "GEN", accent: true },
          { label: "Open positions", text: String(data?.items.filter((i) => !i.position.claimed).length ?? 0), suffix: "" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl px-5 py-4">
            <div className="text-[10px] font-medium tracking-[0.22em] text-faint uppercase">{s.label}</div>
            <div className={`mt-1 font-mono text-2xl font-bold tabular ${s.accent ? "text-up" : "text-paper"}`}>
              {s.text}
              {s.suffix && <span className="ml-1.5 text-sm font-normal text-fade">{s.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {feedback && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            feedback.ok ? "border-up/30 bg-up/10 text-up" : "border-down/30 bg-down/10 text-down"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback.text}
        </div>
      )}

      <div className="mt-8 space-y-3">
        {loading && !data && <div className="glass h-24 animate-pulse rounded-2xl" />}
        {data && data.items.length === 0 && (
          <div className="glass flex flex-col items-center rounded-3xl px-8 py-14 text-center">
            <PiggyBank className="h-8 w-8 text-glow" />
            <h2 className="mt-4 text-lg font-semibold text-paper">No positions yet</h2>
            <p className="mt-1 max-w-sm text-sm text-fade">
              Pick a market, stake 1–10 GEN on UP or DOWN, and let the validators settle it.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-glow/40 bg-glow/10 px-5 py-2.5 text-sm font-semibold text-glow transition-colors hover:bg-glow/20"
            >
              Browse markets <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {data?.items.map(({ position, market, claim: c }) => {
          const settled = market.phase === "SETTLED" || market.phase === "REFUND";
          const claimable = c.kind !== "NONE" && c.amount > 0 && !position.claimed;
          const SideIcon = position.side === "UP" ? TrendingUp : TrendingDown;
          return (
            <div key={position.id} className="glass glass-hover rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-ink-900 font-mono text-xs font-bold text-glow">
                    {market.ticker}
                  </span>
                  <div>
                    <Link href={`/market/${market.id}`} className="group flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-paper group-hover:text-glow">
                        {market.name} · {market.marketDate}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-faint group-hover:text-glow" />
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <PhaseBadge phase={market.phase} size="sm" />
                      {settled && <OutcomeChip resolution={market.resolution} refundAll={market.refundAll} size="sm" />}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          position.side === "UP" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                        }`}
                      >
                        <SideIcon className="h-3 w-3" />
                        {position.side} · {fmtGen(position.stake)} GEN
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {position.claimed ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-line bg-ink-900/60 px-4 py-2 text-xs font-semibold text-fade">
                      <CheckCircle2 className="h-3.5 w-3.5 text-up" /> Claimed
                    </span>
                  ) : claimable ? (
                    <button
                      onClick={() => void claim(market.id)}
                      disabled={busyId !== null}
                      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-up/80 to-up px-5 py-2.5 text-xs font-bold text-ink-950 shadow-[0_8px_30px_-8px_rgba(46,230,168,0.8)] transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                    >
                      {busyId === market.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Claim {fmtGen(c.amount)} GEN {c.kind === "REFUND" ? "(refund)" : ""}
                    </button>
                  ) : settled ? (
                    <span className="rounded-full border border-line-soft px-4 py-2 text-xs text-faint">
                      {position.side === (market.resolution as Side) ? "—" : "Losing side"}
                    </span>
                  ) : (
                    <Link
                      href={`/market/${market.id}`}
                      className="rounded-full border border-glow/40 bg-glow/10 px-4 py-2 text-xs font-semibold text-glow transition-colors hover:bg-glow/20"
                    >
                      Manage
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
