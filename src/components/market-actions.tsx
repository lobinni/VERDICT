"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Gavel,
  Loader2,
  Lock,
  TrendingDown,
  TrendingUp,
  Vote,
  Wallet,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/client-api";
import { MAX_POSITION_GEN, MIN_POSITION_GEN, NETWORK } from "@/lib/constants";
import { fmtGen, round8 } from "@/lib/format";
import {
  chainReady,
  genToWei,
  mirrorPost,
  readContractView,
  writeContractCall,
  type WriteStage,
} from "@/lib/genlayer-wallet";
import type { MarketView, Side } from "@/lib/types";
import { useWallet } from "./wallet-provider";

type Mine = {
  source?: string;
  position: { side: Side; stake: number; claimed: boolean } | null;
  claim: { kind: "PAYOUT" | "REFUND" | "NONE"; amount: number };
  capacity?: number | null;
  result?: string;
};

type ChainUserMarket = { stake: number; side: string; claimed: boolean; claimable: number };

const STAGE_LABEL: Record<WriteStage, string> = {
  preflight: "Simulating against the contract…",
  submitted: "Confirm in MetaMask — executing…",
  consensus: "Validators reaching consensus…",
  done: "",
};

export function MarketActions({ market }: { market: MarketView }) {
  const router = useRouter();
  const { hasMetaMask, address, balanceGen, connecting, connect, error: walletError } = useWallet();

  const [side, setSide] = useState<Side>("UP");
  const [amount, setAmount] = useState("2");
  const [busy, setBusy] = useState<"stake" | "close" | "resolve" | "claim" | null>(null);
  const [stage, setStage] = useState<WriteStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);

  const useChain = chainReady();

  const loadMine = useCallback(async () => {
    if (!address) {
      setMine(null);
      return;
    }
    try {
      setMine(await apiGet<Mine>(`/api/markets/${market.id}/position?address=${encodeURIComponent(address)}`));
    } catch {
      /* noop */
    }
  }, [address, market.id]);

  useEffect(() => {
    void loadMine();
  }, [loadMine, market.status, market.resolution]);

  const parsed = Number(amount);
  const myStake = mine?.position?.stake ?? 0;
  const capacity = round8(mine?.capacity ?? Math.max(0, MAX_POSITION_GEN - myStake));
  const sideLocked = mine?.position && !mine.position.claimed ? mine.position.side : null;

  const canStake =
    market.phase === "PREDICTION_OPEN" &&
    !!address &&
    Number.isFinite(parsed) &&
    parsed >= MIN_POSITION_GEN &&
    parsed <= capacity &&
    parsed > 0;

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<string>) {
    if (!address) {
      await connect();
      return;
    }
    setBusy(kind);
    setError(null);
    setNote(null);
    setStage(null);
    try {
      setNote(await fn());
      await loadMine();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
      setStage(null);
    }
  }

  /* ------------------------------ actions ------------------------------ */

  const stake = () =>
    run("stake", async () => {
      const chosenSide = sideLocked ?? side;
      if (!useChain) {
        await apiPost(`/api/markets/${market.id}/position`, { address, side: chosenSide, amount: parsed });
        return `Position recorded: ${fmtGen(parsed)} GEN on ${chosenSide}.`;
      }
      await writeContractCall(address!, "take_position", [market.id, chosenSide], genToWei(parsed), setStage);
      const um = await readContractView<ChainUserMarket>("get_user_market", [market.id, address]).catch(() => null);
      if (um) {
        await mirrorPost({
          action: "position",
          symbol: market.symbol,
          marketDate: market.marketDate,
          address,
          side: (um.side === "UP" || um.side === "DOWN" ? um.side : chosenSide) as Side,
          stake: round8(Number(um.stake) / 1e18),
          delta: parsed,
        });
      }
      return `Validators accepted your stake of ${fmtGen(parsed)} GEN on ${chosenSide}.`;
    });

  const close = () =>
    run("close", async () => {
      if (!useChain) {
        await apiPost(`/api/markets/${market.id}/close`, { address });
        return "Entries locked at the UTC cutoff.";
      }
      await writeContractCall(address!, "close_entries", [market.id], 0n, setStage);
      return "Entries locked on-chain.";
    });

  const resolve = () =>
    run("resolve", async () => {
      if (!useChain) {
        const res = await apiPost<{ evidence: { resolution: string; refundAll: boolean } }>(
          `/api/markets/${market.id}/resolve`,
          { address },
        );
        return `Validator consensus reached — verdict ${res.evidence.resolution}${
          res.evidence.refundAll ? ", all stakes refundable" : ""
        }.`;
      }
      await writeContractCall(address!, "resolve_market", [market.id], 0n, setStage);
      const m = await readContractView<{ resolution: string; refund_all: boolean }>("get_market", [market.id]).catch(
        () => null,
      );
      if (m && m.resolution !== "NONE") {
        await mirrorPost({
          action: "resolve",
          symbol: market.symbol,
          marketDate: market.marketDate,
          address,
          resolution: m.resolution,
          refundAll: Boolean(m.refund_all),
          evidence: null,
        });
        return `Consensus reached on-chain — verdict ${m.resolution}${m.refund_all ? ", every stake refundable" : ""}.`;
      }
      return "Settlement transaction accepted — the verdict is being recorded by validators.";
    });

  const claim = () =>
    run("claim", async () => {
      const info = mine?.claim ?? { kind: "NONE", amount: 0 };
      if (!useChain) {
        const res = await apiPost<{ claim: { amount: number; kind: string } }>(
          `/api/markets/${market.id}/claim`,
          { address },
        );
        return `Claimed ${fmtGen(res.claim.amount)} GEN ${res.claim.kind === "REFUND" ? "refund" : "payout"}.`;
      }
      await writeContractCall(address!, "claim", [market.id], 0n, setStage);
      await mirrorPost({
        action: "claim",
        symbol: market.symbol,
        marketDate: market.marketDate,
        address,
        amount: info.amount,
        kind: info.kind === "REFUND" ? "REFUND" : "PAYOUT",
      });
      return `Claimed ${fmtGen(info.amount)} GEN ${info.kind === "REFUND" ? "refund" : "payout"} on-chain.`;
    });

  /* ------------------------------ render ------------------------------ */

  const resolved = market.phase === "SETTLED" || market.phase === "REFUND";
  const claimable =
    mine && mine.claim.kind !== "NONE" && mine.claim.amount > 0 && mine.position && !mine.position.claimed;
  const busyLabel = stage && busy ? STAGE_LABEL[stage] : null;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-paper">Take part on-chain</h3>
        <span className="text-[10px] font-medium tracking-[0.2em] text-faint uppercase">
          {useChain ? "signed writes" : "demo mode"}
        </span>
      </div>

      {/* wallet line */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-line-soft bg-ink-900/60 px-3.5 py-2.5 text-xs">
        <span className="flex items-center gap-2 text-fade">
          <Wallet className="h-3.5 w-3.5 text-glow" />
          {address ? "MetaMask" : "Not connected"}
        </span>
        {address ? (
          <span className="font-mono font-semibold text-paper tabular">
            {balanceGen ?? "…"} {NETWORK.currencySymbol}
          </span>
        ) : (
          <button
            onClick={() => void connect()}
            disabled={connecting || !hasMetaMask}
            className="flex items-center gap-1.5 font-semibold text-glow hover:underline disabled:opacity-50"
          >
            {connecting && <Loader2 className="h-3 w-3 animate-spin" />}
            {hasMetaMask ? "Connect" : "MetaMask required"}
          </button>
        )}
      </div>

      {walletError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-xs text-down">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {walletError}
        </div>
      )}

      {address && balanceGen !== null && Number(balanceGen) < 0.2 && (
        <a
          href="https://testnet-faucet.genlayer.foundation/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/10 px-3.5 py-2 text-xs leading-relaxed text-gold transition-colors hover:bg-gold/20"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Low balance ({balanceGen} GEN) — claim 100 GEN free from the official testnet faucet
          before writing on-chain.
        </a>
      )}

      {/* stage line */}
      {busyLabel && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-glow/25 bg-glow/10 px-3.5 py-2.5 text-xs text-glow">
          {stage === "consensus" ? <Vote className="h-3.5 w-3.5 animate-pulse" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busyLabel}
        </div>
      )}

      {/* my position */}
      {mine?.position && (
        <div className="mt-4 rounded-xl border border-line bg-ink-900/60 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fade">Your position</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                mine.position.side === "UP" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {mine.position.side === "UP" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {mine.position.side}
            </span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-paper tabular">
            {fmtGen(mine.position.stake)} <span className="text-xs font-normal text-faint">GEN staked</span>
          </div>
          {mine.position.claimed && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fade">
              <CheckCircle2 className="h-3.5 w-3.5 text-up" /> Claimed
            </div>
          )}
        </div>
      )}

      {/* claim */}
      {resolved && (
        <div className="mt-4">
          {claimable ? (
            <button
              onClick={claim}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-up/80 to-up px-4 py-3.5 text-sm font-bold text-ink-950 shadow-[0_10px_36px_-10px_rgba(46,230,168,0.8)] transition-transform not-disabled:hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            >
              {busy === "claim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Claim {fmtGen(mine!.claim.amount)} GEN {mine!.claim.kind === "REFUND" ? "refund" : "payout"}
            </button>
          ) : (
            <div className="rounded-xl border border-line-soft bg-ink-900/50 px-4 py-3 text-center text-xs text-fade">
              {mine?.position
                ? mine.position.claimed
                  ? "This position was already claimed."
                  : "No claimable amount for this position."
                : address
                  ? "This wallet holds no position in this market."
                  : "Connect MetaMask to check claims."}
            </div>
          )}
        </div>
      )}

      {/* stake */}
      {market.phase === "PREDICTION_OPEN" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            {(["UP", "DOWN"] as const).map((s) => {
              const Icon = s === "UP" ? TrendingUp : TrendingDown;
              const active = (sideLocked ?? side) === s;
              return (
                <button
                  key={s}
                  onClick={() => !sideLocked && setSide(s)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3.5 transition-all ${
                    active
                      ? s === "UP"
                        ? "border-up/60 bg-up/15 text-up shadow-[0_0_30px_-8px_rgba(46,230,168,0.5)]"
                        : "border-down/60 bg-down/15 text-down shadow-[0_0_30px_-8px_rgba(255,95,143,0.5)]"
                      : "border-line-soft bg-ink-900/50 text-faint hover:text-fade"
                  } ${sideLocked && !active ? "opacity-40" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-bold tracking-widest">{s}</span>
                </button>
              );
            })}
          </div>
          {sideLocked && (
            <p className="mt-2 text-center text-[10px] text-faint">
              Side locked to your existing {sideLocked} position — top-ups only.
            </p>
          )}

          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-fade">
              <span>Stake in GEN</span>
              <span className="font-mono tabular">
                min {MIN_POSITION_GEN} · cap left {fmtGen(capacity)}
              </span>
            </div>
            <input
              type="number"
              min={MIN_POSITION_GEN}
              max={capacity}
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-ink-950/80 px-3.5 py-2.5 font-mono text-sm text-paper tabular outline-none focus:border-glow/60"
            />
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 5, 10].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(Math.min(v, Math.max(capacity, 0))))}
                  className="flex-1 rounded-lg border border-line-soft bg-ink-900/60 py-1.5 font-mono text-[11px] text-fade transition-colors hover:border-glow/40 hover:text-paper"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={stake}
            disabled={!canStake || busy !== null}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition-all not-disabled:hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              (sideLocked ?? side) === "UP"
                ? "bg-gradient-to-r from-up/80 to-up text-ink-950 shadow-[0_10px_36px_-10px_rgba(46,230,168,0.7)]"
                : "bg-gradient-to-r from-down/80 to-down text-ink-950 shadow-[0_10px_36px_-10px_rgba(255,95,143,0.7)]"
            }`}
          >
            {busy === "stake" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
            {address
              ? `Stake ${Number.isFinite(parsed) ? fmtGen(parsed) : "0"} GEN on ${sideLocked ?? side}`
              : "Connect MetaMask to stake"}
          </button>
        </div>
      )}

      {/* close entries */}
      {market.phase === "CANDLE_IN_PROGRESS" && (
        <div className="mt-4 space-y-2.5">
          <div className="rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-gold/90">
            Entries closed automatically when the target candle began. Anyone may lock the market
            explicitly — settlement opens at the next UTC midnight.
          </div>
          <button
            onClick={close}
            disabled={busy !== null || market.status === "LOCKED"}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
          >
            {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {market.status === "LOCKED" ? "Entries locked" : "Lock market entries"}
          </button>
        </div>
      )}

      {/* resolve */}
      {market.phase === "READY_TO_RESOLVE" && (
        <div className="mt-4">
          <button
            onClick={resolve}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-glow-deep to-glow px-4 py-3.5 text-sm font-bold text-white shadow-[0_10px_40px_-10px_rgba(139,124,255,0.9)] transition-transform not-disabled:hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {busy === "resolve" ? <Vote className="h-4 w-4 animate-pulse" /> : <Vote className="h-4 w-4" />}
            {busy === "resolve" ? "Validators settling…" : "Request settlement"}
          </button>
          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-faint">
            Permissionless. Validators independently fetch the Binance and Bitget candles and must
            agree exactly — the requester cannot choose the outcome.
          </p>
        </div>
      )}

      <p className="mt-4 border-t border-line-soft/60 pt-3 text-[10px] leading-relaxed text-faint">
        {useChain
          ? `Stakes and payouts are executed by the deployed Intelligent Contract on ${NETWORK.shortName} — MetaMask signs every write.`
          : `This deployment mirrors the contract rules locally for demo purposes.`}
      </p>

      {/* feedback */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-xs text-down">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {note && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-up/30 bg-up/10 px-3.5 py-2.5 text-xs text-up">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {note}
        </div>
      )}
    </div>
  );
}
