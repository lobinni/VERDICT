"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Gavel, Info, Loader2, Vote, Wallet } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { OPEN_LIMIT_DAYS, SUPPORTED_SYMBOLS } from "@/lib/constants";
import { isCanonicalDate } from "@/lib/time";
import {
  chainReady,
  readContractView,
  writeContractCall,
  type WriteStage,
} from "@/lib/genlayer-wallet";
import { useWallet } from "@/components/wallet-provider";

function datePlus(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

type ChainMarketsPage = { markets?: { market_id: number; symbol: string; market_date: string }[] };

export default function CreateMarketPage() {
  const router = useRouter();
  const { address, hasMetaMask, connecting, connect, error: walletError } = useWallet();
  const [symbol, setSymbol] = useState<string>(SUPPORTED_SYMBOLS[0].symbol);
  const [date, setDate] = useState<string>(datePlus(1));
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<WriteStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(() => SUPPORTED_SYMBOLS.find((s) => s.symbol === symbol)!, [symbol]);
  const valid = isCanonicalDate(date) && date > datePlus(0) && date <= datePlus(OPEN_LIMIT_DAYS);

  const submit = async () => {
    if (!address) {
      await connect();
      return;
    }
    setBusy(true);
    setError(null);
    setStage(null);
    try {
      await writeContractCall(address, "open_market", [symbol, date], 0n, setStage);

      // The transaction is accepted — locate the new on-chain market id.
      let marketId: number | null = null;
      try {
        const page = await readContractView<ChainMarketsPage>("get_markets", [0, 50]);
        const found = (page.markets ?? []).find((m) => m.symbol === symbol && m.market_date === date);
        marketId = found ? Number(found.market_id) : null;
      } catch {
        /* navigate home regardless */
      }

      // Best-effort mirror so counts and the activity feed observe it too.
      try {
        await apiPost("/api/markets", { address, symbol, marketDate: date });
      } catch {
        /* mirror only */
      }

      router.push(marketId != null ? `/market/${marketId}` : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the market");
      setBusy(false);
      setStage(null);
    }
  };

  const stageText =
    stage === "preflight"
      ? "Simulating against the contract…"
      : stage === "submitted"
        ? "Confirm in MetaMask — executing…"
        : stage === "consensus"
          ? "Validators accepting the market…"
          : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 pb-4 sm:px-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-glow/30 bg-glow/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.22em] text-glow uppercase">
          <Gavel className="h-3.5 w-3.5" />
          On-chain · signed by your wallet
        </div>
        <h1 className="mt-5 text-4xl font-bold text-paper">
          Open a market, <span className="text-iridescent">permissionlessly</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-fade">
          Creation is a real contract write on GenLayer Bradbury: MetaMask signs it, validators
          accept it, and it becomes visible to every user. Subject only to duplicate checks and the{" "}
          {OPEN_LIMIT_DAYS}-day forward limit.
        </p>
      </div>

      <div className="glass mt-10 rounded-3xl p-6 sm:p-8">
        <div className="text-[11px] font-semibold tracking-[0.22em] text-faint uppercase">1 · Choose pair</div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {SUPPORTED_SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              onClick={() => setSymbol(s.symbol)}
              className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                symbol === s.symbol
                  ? "border-glow/60 bg-glow/10 shadow-[0_0_36px_-10px_rgba(139,124,255,0.6)]"
                  : "border-line-soft bg-ink-900/50 hover:border-line"
              }`}
            >
              <div className={`text-sm font-bold ${symbol === s.symbol ? "text-glow" : "text-paper"}`}>{s.ticker}</div>
              <div className="mt-0.5 text-[11px] text-fade">{s.name}</div>
              <div className="mt-1 font-mono text-[9px] text-faint">{s.symbol}</div>
            </button>
          ))}
        </div>

        <div className="mt-7 text-[11px] font-semibold tracking-[0.22em] text-faint uppercase">
          2 · Target UTC candle date
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="date"
            value={date}
            min={datePlus(1)}
            max={datePlus(OPEN_LIMIT_DAYS)}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-ink-950/80 px-4 py-3 font-mono text-sm text-paper [color-scheme:dark] outline-none focus:border-glow/60 sm:max-w-[240px]"
          />
          <div className="flex-1 rounded-xl border border-line-soft bg-ink-900/50 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] text-fade">
              <CalendarClock className="h-3.5 w-3.5 text-glow" />
              <span className="font-semibold text-paper">Market window</span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed text-fade">
              <div>Entries open → until {valid ? `${date} 00:00 UTC` : "…"}</div>
              <div>Target candle → {valid ? `${date} 00:00 → ${nextDay(date)} 00:00 UTC` : "…"}</div>
              <div>Settlement eligible → after {valid ? `${nextDay(date)} 00:00 UTC` : "…"}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line-soft bg-ink-900/40 px-4 py-3 text-[11px] leading-relaxed text-fade">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-glow" />
          <span>
            Settlement compares {meta.ticker}&apos;s target daily candle open against its close on
            both locked venues — Binance USD-M Futures and Bitget USDT Futures, each on the UTC
            daily frame. Agreement decides UP or DOWN; anything else is inconclusive and refunds
            every stake. A small amount of GEN covers network fees — claim test GEN from the
            official faucet first.
          </span>
        </div>

        {(error ?? walletError) && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-xs text-down">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error ?? walletError}
          </div>
        )}

        {!chainReady() && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-gold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No contract is configured for this deployment. Set NEXT_PUBLIC_GL_CONTRACT_ADDRESS to a
            deployed Verdict address and rebuild.
          </div>
        )}

        <button
          onClick={() => void submit()}
          disabled={busy || (!!address && !valid) || !chainReady()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-glow-deep to-glow px-6 py-4 text-sm font-bold text-white shadow-[0_12px_44px_-12px_rgba(139,124,255,0.9)] transition-transform not-disabled:hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            stage === "consensus" ? (
              <Vote className="h-4 w-4 animate-pulse" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )
          ) : address ? (
            <Gavel className="h-4 w-4" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          {busy && stageText
            ? stageText
            : address
              ? "Create market on-chain"
              : hasMetaMask
                ? "Connect MetaMask to create"
                : "MetaMask required"}
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
          Balances must cover network fees too —{" "}
          <a
            href="https://testnet-faucet.genlayer.foundation/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-glow hover:underline"
          >
            claim 100 GEN free from the official faucet
          </a>
          . The first transaction also asks MetaMask to add the Bradbury network.
        </p>
      </div>
    </div>
  );
}
