// Canonical UTC time helpers. The contract reads deterministic transaction
// time from gl.message_raw["datetime"]; this server engine uses Date.now() as
// the equivalent deterministic boundary and never trusts client clocks.

import type { MarketPhase, MarketStatus, Resolution } from "./types";

export const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" canonical UTC date string. */
export function canonicalDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayUtc(now: number = Date.now()): string {
  return canonicalDate(new Date(now));
}

export function addDays(date: string, days: number): string {
  return canonicalDate(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS));
}

export function daysFromToday(days: number, now: number = Date.now()): string {
  return canonicalDate(new Date(now + days * DAY_MS));
}

/** Strict canonical-date validation (regex + real round-trip). */
export function isCanonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return false;
  return canonicalDate(new Date(ms)) === value;
}

export function candleOpenMs(marketDate: string): number {
  return Date.parse(`${marketDate}T00:00:00.000Z`);
}

export function candleCloseMs(marketDate: string): number {
  return candleOpenMs(marketDate) + DAY_MS;
}

/** Whole days from `date` to today (positive when date is in the future). */
export function daysUntil(date: string, now: number = Date.now()): number {
  return Math.round((candleOpenMs(date) - Date.parse(`${todayUtc(now)}T00:00:00.000Z`)) / DAY_MS);
}

/**
 * Read-API phase resolution, exactly as the contract exposes it:
 *   OPEN   + now <  candleOpenMs  -> PREDICTION_OPEN
 *   OPEN*  + candle in progress   -> CANDLE_IN_PROGRESS
 *   OPEN*  + candle complete      -> READY_TO_RESOLVE
 *   RESOLVED (refund_all)         -> REFUND
 *   RESOLVED (directional)        -> SETTLED
 */
export function phaseOf(
  m: { status: MarketStatus; resolution: Resolution | null; refundAll: boolean; marketDate: string },
  now: number = Date.now(),
): MarketPhase {
  if (m.status === "RESOLVED") return m.refundAll ? "REFUND" : "SETTLED";
  if (now < candleOpenMs(m.marketDate)) return "PREDICTION_OPEN";
  if (now < candleCloseMs(m.marketDate)) return "CANDLE_IN_PROGRESS";
  return "READY_TO_RESOLVE";
}

/** Next countdown target + label for a phase. */
export function nextMilestone(
  m: { status: MarketStatus; marketDate: string; resolution: Resolution | null; refundAll: boolean },
  now: number = Date.now(),
): { atMs: number | null; label: string } {
  const phase = phaseOf(m, now);
  switch (phase) {
    case "PREDICTION_OPEN":
      return { atMs: candleOpenMs(m.marketDate), label: "Entries close" };
    case "CANDLE_IN_PROGRESS":
      return { atMs: candleCloseMs(m.marketDate), label: "Candle completes" };
    case "READY_TO_RESOLVE":
      return { atMs: null, label: "Awaiting consensus" };
    case "SETTLED":
      return { atMs: null, label: "Settled" };
    case "REFUND":
      return { atMs: null, label: "Refundable" };
  }
}

/** "2026-08-26 14:03:55 UTC" stable string (no hydration drift). */
export function formatUtc(ms: number | Date): string {
  const d = typeof ms === "number" ? new Date(ms) : ms;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
  );
}
