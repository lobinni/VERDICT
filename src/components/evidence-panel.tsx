import { CheckCircle2, Landmark, ShieldCheck, Vote, XCircle } from "lucide-react";
import { OutcomeChip } from "@/components/phase-badge";
import { fmtUsd } from "@/lib/format";
import { formatUtc } from "@/lib/time";
import type { SettlementEvidence, SourceEvidence } from "@/lib/types";

const VENUE: Record<string, string> = {
  BINANCE: "Binance USD-M Futures",
  BITGET: "Bitget USDT Futures",
};

function SourceCard({ s }: { s: SourceEvidence }) {
  const ok = s.status === "OK";
  const dirCls = s.direction === "UP" ? "text-up" : s.direction === "DOWN" ? "text-down" : "text-fade";
  const dirText = s.direction === "UP" ? "higher" : s.direction === "DOWN" ? "lower" : "no signal";
  return (
    <div className="rounded-xl border border-line-soft bg-ink-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-glow" />
          <span className="text-xs font-bold text-paper">{VENUE[s.source] ?? s.source}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-widest ${
            ok ? "bg-up/15 text-up" : "bg-down/15 text-down"
          }`}
        >
          {ok ? "VERIFIED" : "FAILED"}
        </span>
      </div>

      <div className="mt-1 text-[10px] text-faint">Daily candle, UTC midnight to UTC midnight</div>

      {ok && s.open != null && s.close != null ? (
        <>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-[9px] tracking-[0.2em] text-faint uppercase">Opened at</div>
              <div className="font-mono text-lg font-bold text-paper tabular">${fmtUsd(s.open)}</div>
            </div>
            <div className={`text-sm font-semibold ${dirCls}`}>closed {dirText}</div>
            <div className="text-right">
              <div className="text-[9px] tracking-[0.2em] text-faint uppercase">Closed at</div>
              <div className={`font-mono text-lg font-bold tabular ${dirCls}`}>${fmtUsd(s.close)}</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-faint">
            Window {formatUtc(s.candleOpenMs ?? 0).slice(0, 16)} → {formatUtc(s.candleCloseMs ?? 0).slice(11, 16)} UTC
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-down/90">
          <XCircle className="h-3.5 w-3.5" />
          Source produced no usable candle ({(s.reason ?? "SOURCE_ERROR").toLowerCase().replace(/_/g, " ")})
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({ evidence, refundAll }: { evidence: SettlementEvidence; refundAll: boolean }) {
  const b = evidence.binance.direction;
  const g = evidence.bitget.direction;
  const phrase = (d: string) => (d === "NONE" ? "gave no usable signal" : `closed ${d.toLowerCase()}`);
  const agreeCount = evidence.validators.filter((v) => v.agree).length;
  const onChain = evidence.validators.length === 0;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-up" />
          <div>
            <h3 className="text-sm font-semibold text-paper">Settlement evidence</h3>
            <div className="text-[10px] tracking-[0.2em] text-faint uppercase">
              validator consensus, exact match required
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OutcomeChip resolution={evidence.resolution} refundAll={refundAll} size="sm" />
          {onChain ? (
            <span className="rounded-full border border-up/30 bg-up/10 px-2.5 py-1 text-[10px] font-bold text-up">
              Recorded on-chain by the validator set
            </span>
          ) : (
            <span className="rounded-full border border-up/30 bg-up/10 px-2.5 py-1 text-[10px] font-bold text-up">
              {agreeCount} of {evidence.validators.length} validators agreed
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SourceCard s={evidence.binance} />
        <SourceCard s={evidence.bitget} />
      </div>

      <div className="mt-4 rounded-xl border border-line-soft bg-ink-900/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-fade uppercase">How the verdict was reached</span>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-paper/90">
          Binance {phrase(b)} and Bitget {phrase(g)}, so the verdict is{" "}
          <span className="font-bold">{evidence.resolution}</span>
          {evidence.resolution === "INCONCLUSIVE" ? " and every stake is refundable." : "."}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          UP requires both venues to report a higher close; DOWN requires both to report a lower
          close. Every other pairing — missing, malformed, mistimed, or flat candles — is
          inconclusive. No single source can decide alone.
        </p>
      </div>

      {!onChain && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-fade uppercase">
            <Vote className="h-3.5 w-3.5" />
            Consensus round
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {evidence.validators.map((v) => (
            <div
              key={v.index}
              className="flex items-center justify-between rounded-lg border border-line-soft/70 bg-ink-900/40 px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    v.role === "LEADER" ? "bg-glow/20 text-glow" : "bg-paper/10 text-fade"
                  }`}
                >
                  {v.label}
                </span>
              </span>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${v.agree ? "text-up" : "text-down"}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {v.agree ? "Evidence accepted" : "Rejected"}
              </span>
            </div>
          ))}
        </div>
        </div>
      )}
      {onChain && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line-soft bg-ink-900/60 px-4 py-3 text-[11px] leading-relaxed text-fade">
          <Vote className="h-3.5 w-3.5 shrink-0 text-glow" />
          This verdict and its two-source evidence were produced by the Bradbury validator set and
          are read directly from the deployed Intelligent Contract. Verify the same record on the
          explorer using the address in the footer.
        </div>
      )}
    </div>
  );
}
