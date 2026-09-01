/**
 * Unit tests for the multi-source quote/candle parsers in src/lib/quotes.ts.
 * Exchange payloads are inline test fixtures only — never app data.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseBinanceKlines,
  parseBinanceTicker,
  parseBitgetCandles,
  parseBitgetTicker,
  parseGateCandles,
  parseGateTicker,
  parseOkxCandles,
  parseOkxTicker,
} from "../src/lib/quotes";

describe("quote parsers", () => {
  test("binance spot 24hr ticker", () => {
    const q = parseBinanceTicker("BTCUSDT", {
      symbol: "BTCUSDT",
      lastPrice: "67123.45",
      priceChangePercent: "2.345",
      highPrice: "68000.00",
      lowPrice: "65000.00",
      quoteVolume: "1234567890.12",
    })!;
    assert.equal(q.source, "BINANCE");
    assert.equal(q.price, 67123.45);
    assert.equal(q.change24hPct, 2.35);
    assert.equal(q.high24h, 68000);
    assert.equal(q.low24h, 65000);
    assert.equal(q.volume24h, 1234567890.12);
    assert.ok(q.updatedMs > 0);
    assert.equal(parseBinanceTicker("BTCUSDT", null), null);
  });

  test("bitget spot ticker converts the decimal ratio to percent", () => {
    const q = parseBitgetTicker("ETHUSDT", {
      code: "00000",
      data: [{ lastPr: "3450.5", change24h: "-0.0123", high24h: "3510", low24h: "3390", quoteVolume: "5000000" }],
    })!;
    assert.equal(q.source, "BITGET");
    assert.equal(q.price, 3450.5);
    assert.equal(q.change24hPct, -1.23);
    assert.equal(parseBitgetTicker("ETHUSDT", { code: "40001", data: [] }), null);
  });

  test("okx ticker derives change from open24h", () => {
    const q = parseOkxTicker("SOLUSDT", {
      code: "0",
      data: [{ last: "161", open24h: "160", high24h: "165", low24h: "155", volCcy24h: "9000000" }],
    })!;
    assert.equal(q.source, "OKX");
    assert.equal(q.change24hPct, 0.63);
    assert.equal(q.volume24h, 9000000);
    assert.equal(parseOkxTicker("SOLUSDT", { code: "1", data: [] }), null);
  });

  test("gate ticker uses change_percentage directly", () => {
    const q = parseGateTicker("BNBUSDT", [
      {
        currency_pair: "BNB_USDT",
        last: "590.1",
        change_percentage: "-0.5",
        high_24h: "600",
        low_24h: "580",
        quote_volume: "12000000",
      },
    ])!;
    assert.equal(q.source, "GATE");
    assert.equal(q.change24hPct, -0.5);
    assert.equal(parseGateTicker("BNBUSDT", [{}]), null);
    assert.equal(parseGateTicker("BNBUSDT", "nope"), null);
  });
});

describe("venue candle parsers", () => {
  test("okx candles parse strings and sort ascending", () => {
    const rows = parseOkxCandles({
      code: "0",
      data: [
        ["1714608000000", "102", "103", "101", "102.5", "10"],
        ["1714521600000", "100", "103", "99", "102", "12"],
      ],
    })!;
    assert.deepEqual(rows.map((r) => r.t), [1714521600000, 1714608000000]);
    assert.deepEqual(rows[0], { t: 1714521600000, o: 100, h: 103, l: 99, c: 102 });
    assert.equal(parseOkxCandles({ code: "1", data: [] }), null);
  });

  test("gate candlesticks map the column order and seconds epoch", () => {
    // Gate format: [t_seconds, quoteVol, close, high, low, open]
    const rows = parseGateCandles([
      ["1714521600", "1000", "102", "103", "99", "100"],
    ])!;
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { t: 1714521600000, o: 100, h: 103, l: 99, c: 102 });
    assert.equal(parseGateCandles("nope"), null);
    assert.equal(parseGateCandles([["1", "0", "0", "0", "0", "0"]]), null);
  });

  test("binance klines parse numbers/strings and sort ascending", () => {
    const rows = parseBinanceKlines([
      [1714608000000, "102", "103", "101", "102.5", "9"],
      [1714521600000, 100, 103, 99, 102, "12"],
    ])!;
    assert.deepEqual(rows.map((r) => r.t), [1714521600000, 1714608000000]);
    assert.equal(parseBinanceKlines([]), null);
  });

  test("bitget candle envelope validates the code", () => {
    const rows = parseBitgetCandles({
      code: "00000",
      data: [["1714521600000", "100", "103", "99", "102", "1"]],
    })!;
    assert.equal(rows.length, 1);
    assert.equal(parseBitgetCandles({ code: "40001", data: [] }), null);
  });
});
