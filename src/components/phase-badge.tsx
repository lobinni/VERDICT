import { CheckCircle2, Flame, Hourglass, Lock, RefreshCcw } from "lucide-react";
import type { MarketPhase, Resolution } from "@/lib/types";

const STYLES: Record<MarketPhase, { label: string; cls: string; dot: string; Icon: typeof Flame }> = {
  PREDICTION_OPEN: {
    label: "Predictions Open",
    cls: "border-up/30 bg-up/10 text-up",
    dot: "bg-up text-up",
    Icon: Flame,
  },
  CANDLE_IN_PROGRESS: {
    label: "Candle Live",
    cls: "border-gold/30 bg-gold/10 text-gold",
    dot: "bg-gold text-gold",
    Icon: Hourglass,
  },
  READY_TO_RESOLVE: {
    label: "Ready to Settle",
    cls: "border-glow/40 bg-glow/10 text-glow",
    dot: "bg-glow text-glow",
    Icon: Lock,
  },
  SETTLED: {
    label: "Settled",
    cls: "border-paper/20 bg-paper/5 text-paper/80",
    dot: "bg-paper/70 text-paper/70",
    Icon: CheckCircle2,
  },
  REFUND: {
    label: "Refundable",
    cls: "border-fade/30 bg-fade/10 text-fade",
    dot: "bg-fade text-fade",
    Icon: RefreshCcw,
  },
};

export function PhaseBadge({ phase, size = "md" }: { phase: MarketPhase; size?: "sm" | "md" }) {
  const s = STYLES[phase];
  const live = phase !== "SETTLED" && phase !== "REFUND";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${s.cls} ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${live ? "animate-pulse-dot" : ""}`} />
      <span className="tracking-wide whitespace-nowrap uppercase">{s.label}</span>
    </span>
  );
}

export function OutcomeChip({ resolution, refundAll, size = "md" }: {
  resolution: Resolution | null;
  refundAll: boolean;
  size?: "sm" | "md";
}) {
  if (!resolution) return null;
  const pad = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  if (refundAll) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-fade/30 bg-fade/10 text-fade ${pad}`}>
        REFUND ALL
      </span>
    );
  }
  const up = resolution === "UP";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold tracking-widest ${pad} ${
        up ? "border-up/40 bg-up/15 text-up" : "border-down/40 bg-down/15 text-down"
      }`}
    >
      {up ? "▲ UP" : "▼ DOWN"}
    </span>
  );
}
