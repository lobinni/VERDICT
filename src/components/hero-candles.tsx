"use client";

import { useEffect, useRef } from "react";

type Candle = { o: number; c: number; h: number; l: number };

/**
 * Living candle-field animation: a price walk that continuously mints new
 * candles and scrolls left — a purely decorative engine visual.
 */
export function HeroCandles({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const candles: Candle[] = [];
    let price = 100;
    const CANDLE_W = 14;
    const GAP = 7;
    const STEP_MS = 1100;
    let lastStep = 0;
    let live: Candle = { o: price, c: price, h: price, l: price };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.ceil(width / (CANDLE_W + GAP)) + 2;
    for (let i = 0; i < count; i++) {
      const c = price + (Math.random() - 0.486) * 3.4;
      candles.push({
        o: price,
        c,
        h: Math.max(price, c) + Math.random() * 1.8,
        l: Math.min(price, c) - Math.random() * 1.8,
      });
      price = Math.max(40, c);
    }
    live = { o: price, c: price, h: price, l: price };

    const draw = (t: number) => {
      if (t - lastStep > STEP_MS) {
        lastStep = t;
        candles.push(live);
        if (candles.length > count + 4) candles.shift();
        price = live.c;
        live = { o: price, c: price, h: price, l: price };
      } else {
        const tick = live.c + (Math.random() - 0.49) * 0.45;
        live = { ...live, c: tick, h: Math.max(live.h, tick), l: Math.min(live.l, tick) };
      }

      ctx.clearRect(0, 0, width, height);

      const all = [...candles, live];
      let min = Infinity;
      let max = -Infinity;
      for (const c of all) {
        min = Math.min(min, c.l);
        max = Math.max(max, c.h);
      }
      const pad = (max - min) * 0.15 + 1;
      min -= pad;
      max += pad;
      const y = (v: number) => height - ((v - min) / (max - min)) * height;

      ctx.strokeStyle = "rgba(139,124,255,0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const gy = (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      all.forEach((c, i) => {
        const x = i * (CANDLE_W + GAP) + 4;
        const up = c.c >= c.o;
        const col = up ? "46,230,168" : "255,95,143";
        ctx.strokeStyle = `rgba(${col},0.85)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + CANDLE_W / 2, y(c.h));
        ctx.lineTo(x + CANDLE_W / 2, y(c.l));
        ctx.stroke();

        const top = y(Math.max(c.o, c.c));
        const hgt = Math.max(2, Math.abs(y(c.o) - y(c.c)));
        const grd = ctx.createLinearGradient(0, top, 0, top + hgt);
        grd.addColorStop(0, `rgba(${col},0.95)`);
        grd.addColorStop(1, `rgba(${col},0.45)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.roundRect(x, top, CANDLE_W, hgt, 2.5);
        ctx.fill();
      });

      const ly = y(live.c);
      ctx.strokeStyle = "rgba(239,235,255,0.35)";
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(width, ly);
      ctx.stroke();
      ctx.setLineDash([]);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={`h-full w-full ${className}`} aria-hidden />;
}
