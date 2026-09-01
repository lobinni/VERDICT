"use client";

import { useEffect, useState } from "react";

/** Live UTC clock — the only clock the consensus timeline cares about. */
export function UtcClock() {
  const [stamp, setStamp] = useState<string>("--:--:--");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setStamp(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line-soft bg-ink-900/70 px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] text-fade lg:flex">
      <span className="h-1.5 w-1.5 rounded-full bg-up text-up animate-pulse-dot" />
      <span className="tabular">{stamp} UTC</span>
    </span>
  );
}
