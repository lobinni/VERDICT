"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio, RefreshCcw } from "lucide-react";
import { fmtUsd } from "@/lib/format";
import { candleOpenMs } from "@/lib/time";
import type { ChartCandle, LiveQuote, QuoteChartResult } from "@/lib/quotes";
import { SOURCE_LABEL } from "@/lib/quotes";

/* ------------------------------ helpers ------------------------------ */

function fmtCompact(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

function dayOpenMs(ms: number): number {
  return Math.floor(ms / 86_400_000) * 86_400_000;
}

/** Fold a live tick into the running candle; roll forward on day change. */
function mergeQuote(candles: ChartCandle[], quote: LiveQuote): ChartCandle[] {
  if (!candles.length || !(quote.price > 0)) return candles;
  const open = dayOpenMs(quote.updatedMs);
  const last = candles[candles.length - 1];
  if (open === last.t) {
    const next = candles.slice(0, -1);
    next.push({ ...last, c: quote.price, h: Math.max(last.h, quote.price), l: Math.min(last.l, quote.price) });
    return next;
  }
  if (open > last.t) {
    return [...candles, { t: open, o: quote.price, h: quote.price, l: quote.price, c: quote.price }];
  }
  return candles;
}

/* --------------------------- tooltip overlay -------------------------- */

const W = 820;
const H = 340;
const PAD_L = 8;
const PAD_R = 64;
const PAD_T = 22;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

export function LivePriceChart({
  symbol,
  marketDate,
  initialQuote,
  initialChart,
}: {
  symbol: string;
  marketDate: string;
  initialQuote: LiveQuote | null;
  initialChart: QuoteChartResult | null;
}) {
  const [quote, setQuote] = useState<LiveQuote | null>(initialQuote);
  const [candles, setCandles] = useState<ChartCandle[]>(initialChart?.candles ?? []);
  const [candleSource, setCandleSource] = useState<string | null>(
    initialChart ? SOURCE_LABEL[initialChart.source] : null,
  );
  const [hover, setHover] = useState<number | null>(null);
  const prevPrice = useRef<number | null>(null);
  const flash = useRef<"up" | "down" | null>(null);
  const [, forceFlashPaint] = useState(0);

  /* ------------------------- live polling --------------------------- */
  const pollQuote = useCallback(async () => {
    try {
      const res = await fetch(`/api/ticker?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { quote: LiveQuote | null };
      if (data.quote) {
        setQuote((prev) => {
          flash.current = prev == null || data.quote!.price > prev.price ? "up" : data.quote!.price < prev.price ? "down" : flash.current;
          forceFlashPaint((v) => v + 1);
          prevPrice.current = data.quote!.price;
          return data.quote;
        });
        setCandles((prev) => mergeQuote(prev, data.quote!));
      }
    } catch {
      /* keep last good data */
    }
  }, [symbol]);

  const pollCandles = useCallback(async () => {
    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { chart: QuoteChartResult | null };
      if (data.chart) {
        setCandles(data.chart.candles);
        setCandleSource(SOURCE_LABEL[data.chart.source]);
      }
    } catch {
      /* keep last good data */
    }
  }, [symbol]);

  useEffect(() => {
    if (!quote) void pollQuote();
    if (candles.length === 0) void pollCandles();
    const quoteTimer = setInterval(pollQuote, 4000);
    const candleTimer = setInterval(pollCandles, 60_000);
    return () => {
      clearInterval(quoteTimer);
      clearInterval(candleTimer);
    };
  }, [pollQuote, pollCandles, quote, candles.length]);

  /* --------------------------- geometry ----------------------------- */
  const targetOpenMs = candleOpenMs(marketDate);

  const { min, max, flat } = useMemo(() => {
    if (candles.length < 2) return { min: 0, max: 1, flat: true };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    const span = hi - lo || hi * 0.01 || 1;
    return { min: lo - span * 0.09, max: hi + span * 0.11, flat: false };
  }, [candles]);

  const xFor = useCallback(
    (i: number) => PAD_L + (i / Math.max(candles.length - 1, 1)) * PLOT_W,
    [candles.length],
  );
  const yFor = useCallback((v: number) => PAD_T + (1 - (v - min) / (max - min)) * PLOT_H, [min, max]);

  const lastPrice = quote?.price ?? candles[candles.length - 1]?.c ?? null;
  const change = quote?.change24hPct ?? null;
  const up = (change ?? 0) >= 0;

  const gridLevels = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push(min + ((max - min) / 4) * i);
    return out;
  }, [min, max]);

  const dateTicks = useMemo(() => {
    if (candles.length < 2) return [];
    const idxs = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (candles.length - 1)));
    return [...new Set(idxs)];
  }, [candles]);

  const bw = Math.min(20, (PLOT_W / Math.max(candles.length, 1)) * 0.55);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement) ?? (e.currentTarget as unknown as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (x - PAD_L) / PLOT_W;
    const idx = Math.round(frac * (candles.length - 1));
    setHover(Math.max(0, Math.min(candles.length - 1, idx)));
  };

  const hovered = hover != null ? candles[hover] : null;

  /* ------------------------ unavailable state ----------------------- */
  if (candles.length < 2 && !quote) {
    return (
      <div className="flex h-[340px] flex-col items-center justify-center rounded-xl border border-line-soft bg-ink-900/40 text-center">
        <Radio className="h-5 w-5 text-faint" />
        <p className="mt-3 text-sm font-semibold text-paper">Live feeds unreachable</p>
        <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-fade">
          Binance, Bitget, OKX, and Gate could not be reached from this environment, so nothing is
          drawn — this chart only ever renders real exchange data. It retries automatically every
          few seconds.
        </p>
        <button
          onClick={() => void Promise.allSettled([pollQuote(), pollCandles()])}
          className="mt-4 flex items-center gap-1.5 rounded-full border border-glow/40 bg-glow/10 px-4 py-2 text-xs font-semibold text-glow transition-colors hover:bg-glow/20"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Retry now
        </button>
      </div>
    );
  }

  /* ------------------------------ render ---------------------------- */
  return (
    <div>
      {/* header stats */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div
            className={`font-mono text-3xl font-bold tabular transition-colors duration-300 sm:text-4xl ${
              flash.current === "up" ? "text-up" : flash.current === "down" ? "text-down" : "text-paper"
            }`}
          >
            {lastPrice != null ? `$${fmtUsd(lastPrice)}` : "—"}
          </div>
          {change != null && (
            <span
              className={`mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tabular ${
                up ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {up ? "+" : ""}
              {change.toFixed(2)}% · 24h
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-right">
          <span className="text-[9px] tracking-[0.16em] text-faint uppercase">24h high</span>
          <span className="text-[9px] tracking-[0.16em] text-faint uppercase">24h low</span>
          <span className="text-[9px] tracking-[0.16em] text-faint uppercase">24h volume</span>
          <span className="font-mono text-xs font-semibold text-up tabular">{quote?.high24h != null ? `$${fmtUsd(quote.high24h)}` : "—"}</span>
          <span className="font-mono text-xs font-semibold text-down tabular">{quote?.low24h != null ? `$${fmtUsd(quote.low24h)}` : "—"}</span>
          <span className="font-mono text-xs font-semibold text-paper tabular">${fmtCompact(quote?.volume24h ?? null)}</span>
        </div>
      </div>

      {/* chart */}
      <div className="relative">
        {candles.length >= 2 && lastPrice != null && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${symbol} live daily candles`}>
            <defs>
              <linearGradient id="glUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2ee6a8" />
                <stop offset="100%" stopColor="#2ee6a8" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="glDown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5f8f" />
                <stop offset="100%" stopColor="#ff5f8f" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {gridLevels.map((g, i) => {
              const gy = yFor(g);
              return (
                <g key={i}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke="rgba(139,124,255,0.10)" strokeDasharray="3 6" />
                  <text x={W - PAD_R + 6} y={gy + 3} fill="#6c659c" fontSize="9.5" fontFamily="monospace">
                    {fmtUsd(g)}
                  </text>
                </g>
              );
            })}

            {candles.map((c, i) => {
              const cx = xFor(i);
              const bullish = c.c >= c.o;
              const col = bullish ? "#2ee6a8" : "#ff5f8f";
              const isLast = i === candles.length - 1;
              const isTarget = c.t === targetOpenMs;
              const bodyTop = yFor(Math.max(c.o, c.c));
              const bodyH = Math.max(2, Math.abs(yFor(c.o) - yFor(c.c)));
              return (
                <g key={c.t + i}>
                  {isTarget && (
                    <rect x={cx - bw * 0.95} y={PAD_T} width={bw * 1.9} height={PLOT_H} fill="none" stroke="rgba(139,124,255,0.5)" strokeDasharray="4 4" rx={6} />
                  )}
                  <line x1={cx} x2={cx} y1={yFor(c.h)} y2={yFor(c.l)} stroke={col} strokeWidth={isLast ? 2 : 1.2} />
                  <rect
                    x={cx - bw / 2}
                    y={bodyTop}
                    width={bw}
                    height={bodyH}
                    rx={2}
                    fill={isLast || isTarget ? (bullish ? "url(#glUp)" : "url(#glDown)") : col}
                    opacity={isLast || isTarget ? 1 : 0.78}
                  />
                </g>
              );
            })}

            {/* live price line + tag */}
            <line x1={PAD_L} x2={W - PAD_R} y1={yFor(lastPrice)} y2={yFor(lastPrice)} stroke={up ? "rgba(46,230,168,0.6)" : "rgba(255,95,143,0.6)"} strokeDasharray="5 4" />
            <rect x={W - PAD_R + 3} y={yFor(lastPrice) - 9} width={58} height={18} rx={5} fill={up ? "#0c2d22" : "#33121f"} stroke={up ? "#2ee6a8" : "#ff5f8f"} strokeWidth={0.8} />
            <text x={W - PAD_R + 32} y={yFor(lastPrice) + 3.5} textAnchor="middle" fill={up ? "#2ee6a8" : "#ff5f8f"} fontSize="9.5" fontWeight="bold" fontFamily="monospace">
              {fmtUsd(lastPrice)}
            </text>

            {dateTicks.map((i) => (
              <text key={i} x={xFor(i)} y={H - 10} textAnchor="middle" fill="#6c659c" fontSize="9" fontFamily="monospace">
                {new Date(candles[i].t).toISOString().slice(5, 10)}
              </text>
            ))}

            {/* crosshair */}
            {hovered && (
              <line x1={xFor(hover!)} x2={xFor(hover!)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(239,235,255,0.25)" strokeDasharray="3 3" />
            )}

            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
          </svg>
        )}

        {/* tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[150px] rounded-xl border border-line bg-ink-950/95 p-3 shadow-xl backdrop-blur"
            style={{ left: `${Math.min(Math.max((xFor(hover!) / W) * 100 - 3, 0), 78)}%` }}
          >
            <div className="font-mono text-[10px] font-bold text-paper">
              {new Date(hovered.t).toISOString().slice(0, 10)}
            </div>
            <div className="mt-1.5 space-y-0.5 font-mono text-[10px] tabular">
              <div className="flex justify-between"><span className="text-faint">Open</span><span className="text-paper">${fmtUsd(hovered.o)}</span></div>
              <div className="flex justify-between"><span className="text-faint">High</span><span className="text-up">${fmtUsd(hovered.h)}</span></div>
              <div className="flex justify-between"><span className="text-faint">Low</span><span className="text-down">${fmtUsd(hovered.l)}</span></div>
              <div className="flex justify-between"><span className="text-faint">Close</span><span className={hovered.c >= hovered.o ? "text-up" : "text-down"}>${fmtUsd(hovered.c)}</span></div>
            </div>
            <div className={`mt-1.5 border-t border-line-soft pt-1.5 text-center font-mono text-[10px] font-bold ${hovered.c >= hovered.o ? "text-up" : "text-down"}`}>
              {((hovered.c - hovered.o) / hovered.o >= 0 ? "+" : "") + (((hovered.c - hovered.o) / hovered.o) * 100).toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      {/* feed status line */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft/60 pt-3 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-up text-up animate-pulse-dot" />
          {quote ? (
            <>
              Live quotes from <span className="font-semibold text-fade">{SOURCE_LABEL[quote.source]}</span>
              {candleSource ? (
                <>
                  {" "}· candles from <span className="font-semibold text-fade">{candleSource}</span>
                </>
              ) : null}
              {" "}· updated {fmtTime(quote.updatedMs)}
            </>
          ) : (
            "Reconnecting to live venues…"
          )}
        </span>
        <span>Trusted feeds: Binance · Bitget · OKX · Gate — display only</span>
      </div>
    </div>
  );
}
