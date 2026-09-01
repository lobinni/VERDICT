import {
  CheckCircle2,
  Coins,
  Gavel,
  Lock,
  ScrollText,
  TrendingDown,
  TrendingUp,
  Vote,
} from "lucide-react";
import { listActivity } from "@/lib/engine";
import { fmtGen, shortAddr } from "@/lib/format";
import { formatUtc } from "@/lib/time";
import type { ActivityView } from "@/lib/types";
import { DatabaseNotConfiguredError, isDatabaseError } from "@/db";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

function describe(a: ActivityView): { Icon: typeof Gavel; tint: string; text: string } {
  const d = a.data ?? {};
  const symbol = typeof d.symbol === "string" ? d.symbol : "";
  const date = typeof d.marketDate === "string" ? d.marketDate : "";
  const market = symbol ? `${symbol} · ${date}` : "";

  switch (a.kind) {
    case "MARKET_CREATED":
      return { Icon: Gavel, tint: "text-glow", text: `opened market ${market}` };
    case "POSITION_TAKEN": {
      const side = d.side === "UP" ? "UP" : "DOWN";
      const amt = typeof d.amount === "number" ? fmtGen(d.amount) : "?";
      return {
        Icon: side === "UP" ? TrendingUp : TrendingDown,
        tint: side === "UP" ? "text-up" : "text-down",
        text: `staked ${amt} GEN on ${side} · ${market}`,
      };
    }
    case "ENTRIES_CLOSED":
      return { Icon: Lock, tint: "text-gold", text: `locked entries · ${market}` };
    case "MARKET_RESOLVED": {
      const res = typeof d.resolution === "string" ? d.resolution : "?";
      return {
        Icon: Vote,
        tint: res === "UP" ? "text-up" : res === "DOWN" ? "text-down" : "text-fade",
        text: `validator consensus resolved ${res}${d.refundAll ? " (refund all)" : ""} · ${market}`,
      };
    }
    case "CLAIMED": {
      const amt = typeof d.amount === "number" ? fmtGen(d.amount) : "?";
      const kind = d.kind === "REFUND" ? "refund" : "payout";
      return { Icon: Coins, tint: "text-up", text: `claimed ${amt} GEN ${kind} · ${market}` };
    }
    default:
      return { Icon: ScrollText, tint: "text-fade", text: a.kind };
  }
}

export default async function ActivityPage() {
  let rows: ActivityView[];
  try {
    rows = await listActivity(80);
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) return <SetupNotice />;
    if (isDatabaseError(err)) return <SetupNotice problem="unreachable" />;
    throw err;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-paper">Activity</h1>
          <p className="mt-1 text-sm text-fade">
            Every event is derivable from contract state — the frontend stores nothing off-chain.
          </p>
        </div>
        <span className="font-mono text-xs text-faint tabular">{rows.length} events</span>
      </div>

      <div className="glass mt-7 overflow-hidden rounded-2xl">
        {rows.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-fade">No activity yet.</p>
        )}
        <ol>
          {rows.map((a, i) => {
            const { Icon, tint, text } = describe(a);
            return (
              <li
                key={a.id}
                className={`flex items-center gap-4 px-5 py-4 ${i !== rows.length - 1 ? "border-b border-line-soft/60" : ""}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-ink-900/70">
                  <Icon className={`h-4 w-4 ${tint}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-paper">
                    {a.address ? (
                      <span className="mr-1.5 font-mono text-xs text-glow">{shortAddr(a.address)}</span>
                    ) : null}
                    {text}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-faint">
                    {formatUtc(new Date(a.createdAt))}
                    {a.marketId != null && (
                      <a href={`/market/${a.marketId}`} className="ml-2 text-fade hover:text-glow">
                        market #{a.marketId}
                      </a>
                    )}
                  </div>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-up/60" />
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
