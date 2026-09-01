"use client";

import { useEffect, useState } from "react";
import { DAY_MS } from "@/lib/time";

function render(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";
  const p = (n: number) => String(n).padStart(2, "0");
  const totalSec = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return days > 0 ? `${days}d ${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}

/** Countdown to a UTC milestone; renders a stable placeholder pre-mount. */
export function Countdown({ targetMs, className = "" }: { targetMs: number | null; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (targetMs == null) return;
    const tick = () => setLeft(targetMs - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetMs]);

  if (targetMs == null) return <span className={className}>—</span>;

  return (
    <span className={`tabular ${className}`} suppressHydrationWarning>
      {left == null ? render(targetMs - DAY_MS) : render(left)}
    </span>
  );
}
