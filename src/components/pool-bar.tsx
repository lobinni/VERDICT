"use client";

import { useEffect, useState } from "react";
import { fmtGen, pct } from "@/lib/format";

/** Animated UP/DOWN pool split bar. */
export function PoolBar({
  upPool,
  downPool,
  height = "h-2.5",
  showLabels = true,
}: {
  upPool: number;
  downPool: number;
  height?: string;
  showLabels?: boolean;
}) {
  const total = upPool + downPool;
  const upPct = total > 0 ? pct(upPool, total) : 50;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div>
      <div className={`flex ${height} w-full overflow-hidden rounded-full bg-ink-800`}>
        <div
          className="rounded-l-full bg-gradient-to-r from-up/70 to-up transition-[width] duration-1000 ease-out"
          style={{ width: mounted ? `${upPct}%` : "50%" }}
        />
        <div
          className="rounded-r-full bg-gradient-to-r from-down to-down/60 transition-[width] duration-1000 ease-out"
          style={{ width: mounted ? `${100 - upPct}%` : "50%" }}
        />
      </div>
      {showLabels && (
        <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
          <span className="text-up tabular">▲ {fmtGen(upPool, 2)} GEN · {upPct}%</span>
          <span className="text-down tabular">{100 - upPct}% · {fmtGen(downPool, 2)} GEN ▼</span>
        </div>
      )}
    </div>
  );
}
