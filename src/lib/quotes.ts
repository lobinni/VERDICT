// Real-data market quotes and candle feeds for the display layer.
// Every adapter talks to an official public exchange endpoint; values are
// parsed from live responses only — nothing is fabricated. Sources are
// queried concurrently and the first trusted venue that answers wins
// (Binance, then Bitget, then OKX, then Gate), because individual hosts are
// geo/edge blocked in some regions.

import { isSupportedSymbol } from "./constants";

export type ChartCandle = { t: number; o: number; h: number; l: number; c: number };

export type QuoteSource = "BINANCE" | "BITGET" | "OKX" | "GATE";

export type LiveQuote = {
  source: QuoteSource;
  symbol: string;
  price: number;
  change24hPct: number;
  high24h: number | null;
  low24h: number | null;
  /** 24h traded value in the quote currency (USDT), null when not reported. */
  volume24h: number | null;
  /** Server time when the venue answered (real). */
  updatedMs: number;
};

export type QuoteChartResult = { candles: ChartCandle[]; source: QuoteSource };

const USER_AGENT = "verdict-indexer/1.0 (GenLayer)";

async function tryFetchJson(url: string, timeoutMs = 7000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* Candle parsers (pure)                                               */
/* ------------------------------------------------------------------ */

/** Binance klines: [openTime, open, high, low, close, ...] */
export function parseBinanceKlines(data: unknown): ChartCandle[] | null {
  if (!Array.isArray(data)) return null;
  const out: ChartCandle[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, o, h, l, c] = [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4])];
    if ([t, o, h, l, c].some((v) => !Number.isFinite(v) || v <= 0)) continue;
    out.push({ t, o, h, l, c });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

/** Bitget spot/mix candles envelope: { code:"00000", data:[[ts,o,h,l,c,...]] } */
export function parseBitgetCandles(data: unknown): ChartCandle[] | null {
  const obj = data as { code?: unknown; data?: unknown } | null;
  if (!obj || obj.code !== "00000" || !Array.isArray(obj.data)) return null;
  const out: ChartCandle[] = [];
  for (const row of obj.data) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, o, h, l, c] = [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4])];
    if ([t, o, h, l, c].some((v) => !Number.isFinite(v) || v <= 0)) continue;
    out.push({ t, o, h, l, c });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

/** OKX candles: { code:"0", data:[[tsMs,o,h,l,c,vol,...]] } newest-first */
export function parseOkxCandles(data: unknown): ChartCandle[] | null {
  const obj = data as { code?: unknown; data?: unknown } | null;
  if (!obj || obj.code !== "0" || !Array.isArray(obj.data)) return null;
  const out: ChartCandle[] = [];
  for (const row of obj.data) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, o, h, l, c] = [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4])];
    if ([t, o, h, l, c].some((v) => !Number.isFinite(v) || v <= 0)) continue;
    out.push({ t, o, h, l, c });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

/** Gate spot candlesticks: [[tSec, quoteVol, close, high, low, open, baseVol?]] */
export function parseGateCandles(data: unknown): ChartCandle[] | null {
  if (!Array.isArray(data)) return null;
  const out: ChartCandle[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [t, o, h, l, c] = [Number(row[0]) * 1000, Number(row[5]), Number(row[3]), Number(row[4]), Number(row[2])];
    if ([t, o, h, l, c].some((v) => !Number.isFinite(v) || v <= 0)) continue;
    out.push({ t, o, h, l, c });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out : null;
}

/* ------------------------------------------------------------------ */
/* Ticker parsers (pure)                                               */
/* ------------------------------------------------------------------ */

function makeQuote(source: QuoteSource, symbol: string, p: {
  price: number;
  change24hPct: number;
  high24h?: number | null;
  low24h?: number | null;
  volume24h?: number | null;
}): LiveQuote {
  return {
    source,
    symbol,
    price: p.price,
    change24hPct: Math.round(p.change24hPct * 100) / 100,
    high24h: p.high24h ?? null,
    low24h: p.low24h ?? null,
    volume24h: p.volume24h ?? null,
    updatedMs: Date.now(),
  };
}

/** Binance spot 24hr ticker: { lastPrice, priceChangePercent, highPrice, lowPrice, quoteVolume } */
export function parseBinanceTicker(symbol: string, data: unknown): LiveQuote | null {
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  const price = num(d.lastPrice);
  if (price == null) return null;
  return makeQuote("BINANCE", symbol, {
    price,
    change24hPct: Number(d.priceChangePercent ?? 0),
    high24h: num(d.highPrice),
    low24h: num(d.lowPrice),
    volume24h: num(d.quoteVolume),
  });
}

/** Bitget spot tickers: { code:"00000", data:[{lastPr, change24h(ratio), high24h, low24h, quoteVolume}] } */
export function parseBitgetTicker(symbol: string, data: unknown): LiveQuote | null {
  const obj = data as { code?: unknown; data?: unknown } | null;
  if (!obj || obj.code !== "00000") return null;
  const row = Array.isArray(obj.data) ? (obj.data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return null;
  const price = num(row.lastPr);
  if (price == null) return null;
  return makeQuote("BITGET", symbol, {
    price,
    change24hPct: Number(row.change24h ?? 0) * 100,
    high24h: num(row.high24h),
    low24h: num(row.low24h),
    volume24h: num(row.quoteVolume),
  });
}

/** OKX ticker: { code:"0", data:[{last, open24h, high24h, low24h, volCcy24h}] } */
export function parseOkxTicker(symbol: string, data: unknown): LiveQuote | null {
  const obj = data as { code?: unknown; data?: unknown } | null;
  if (!obj || obj.code !== "0") return null;
  const row = Array.isArray(obj.data) ? (obj.data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return null;
  const price = num(row.last);
  if (price == null) return null;
  const open24h = num(row.open24h);
  return makeQuote("OKX", symbol, {
    price,
    change24hPct: open24h ? ((price - open24h) / open24h) * 100 : 0,
    high24h: num(row.high24h),
    low24h: num(row.low24h),
    volume24h: num(row.volCcy24h),
  });
}

/** Gate tickers: [{last, change_percentage, high_24h, low_24h, quote_volume}] */
export function parseGateTicker(symbol: string, data: unknown): LiveQuote | null {
  if (!Array.isArray(data)) return null;
  const row = data[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const price = num(row.last);
  if (price == null) return null;
  return makeQuote("GATE", symbol, {
    price,
    change24hPct: Number(row.change_percentage ?? 0),
    high24h: num(row.high_24h),
    low24h: num(row.low_24h),
    volume24h: num(row.quote_volume),
  });
}

/* ------------------------------------------------------------------ */
/* Public fetchers — concurrent multi-source with trusted preference    */
/* ------------------------------------------------------------------ */

function spotPair(symbol: string): string {
  return symbol.replace("USDT", "-USDT");
}
function gatePair(symbol: string): string {
  return symbol.replace("USDT", "_USDT");
}

/** Live quote from the first trusted venue that answers. */
export async function getLiveQuote(symbol: string): Promise<LiveQuote | null> {
  if (!isSupportedSymbol(symbol)) return null;
  const [binance, bitget, okx, gate] = await Promise.all([
    tryFetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
    tryFetchJson(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`),
    tryFetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${spotPair(symbol)}`),
    tryFetchJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${gatePair(symbol)}`),
  ]);
  return (
    parseBinanceTicker(symbol, binance) ??
    parseBitgetTicker(symbol, bitget) ??
    parseOkxTicker(symbol, okx) ??
    parseGateTicker(symbol, gate)
  );
}

/** Daily candles from the first trusted venue that answers. */
export async function getLiveCandles(symbol: string, limit = 40): Promise<QuoteChartResult | null> {
  if (!isSupportedSymbol(symbol)) return null;
  const [binance, bitget, okx, gate] = await Promise.all([
    tryFetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`),
    tryFetchJson(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=1day&limit=${limit}`),
    tryFetchJson(`https://www.okx.com/api/v5/market/candles?instId=${spotPair(symbol)}&bar=1Dutc&limit=${limit}`),
    tryFetchJson(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${gatePair(symbol)}&interval=1d&limit=${limit}`),
  ]);

  const b = parseBinanceKlines(binance);
  if (b) return { candles: b, source: "BINANCE" };
  const g2 = parseBitgetCandles(bitget);
  if (g2) return { candles: g2, source: "BITGET" };
  const o = parseOkxCandles(okx);
  if (o) return { candles: o, source: "OKX" };
  const g = parseGateCandles(gate);
  if (g) return { candles: g, source: "GATE" };
  return null;
}

export const SOURCE_LABEL: Record<QuoteSource, string> = {
  BINANCE: "Binance Spot",
  BITGET: "Bitget",
  OKX: "OKX",
  GATE: "Gate",
};
