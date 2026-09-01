/**
 * Unit tests for the settlement evidence pipeline and the candle-window
 * rules. Exchange payloads below are inline test fixtures only — they are
 * never used as application data.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideResolution, pickBinanceCandle, pickBitgetCandle } from "../src/lib/evidence";
import { parseBinanceKlines, parseBitgetCandles } from "../src/lib/quotes";
import {
  candleCloseMs,
  candleOpenMs,
  DAY_MS,
  isCanonicalDate,
  phaseOf,
} from "../src/lib/time";

const DATE = "2026-09-01";
const OPEN = candleOpenMs(DATE);
const CLOSE = candleCloseMs(DATE);

describe("candle window helpers", () => {
  test("candle window is exactly one UTC day", () => {
    assert.equal(OPEN, Date.parse("2026-09-01T00:00:00.000Z"));
    assert.equal(CLOSE - OPEN, DAY_MS);
  });

  test("canonical date validation", () => {
    assert.equal(isCanonicalDate("2026-09-01"), true);
    assert.equal(isCanonicalDate("2026-13-01"), false);
    assert.equal(isCanonicalDate("2026-02-30"), false);
    assert.equal(isCanonicalDate("09/01/2026"), false);
    assert.equal(isCanonicalDate("2026-9-1"), false);
    assert.equal(isCanonicalDate(""), false);
  });

  test("market phases follow the UTC timeline", () => {
    const past = { status: "OPEN" as const, resolution: null, refundAll: false, marketDate: "2020-01-01" };
    const future = { ...past, marketDate: "2999-01-01" };
    assert.equal(phaseOf(past, Date.now()), "READY_TO_RESOLVE");
    assert.equal(phaseOf(future, Date.now()), "PREDICTION_OPEN");
    assert.equal(
      phaseOf({ status: "RESOLVED", resolution: "UP", refundAll: false, marketDate: "2020-01-01" }),
      "SETTLED",
    );
    assert.equal(
      phaseOf({ status: "RESOLVED", resolution: "INCONCLUSIVE", refundAll: true, marketDate: "2020-01-01" }),
      "REFUND",
    );
  });
});

describe("binance candle selection", () => {
  const row = [OPEN, "100.5", "101", "99", "103.25", "1234", CLOSE - 1, "999", "10", "1", "1", "1"];
  const other = [OPEN - DAY_MS, "98", "99", "97", "98.5", "111", OPEN - 1, "1", "1", "1", "1", "1"];

  test("selects the exact target candle by open time", () => {
    const c = pickBinanceCandle([other, row], OPEN);
    assert.ok(c);
    assert.equal(c.openMs, OPEN);
    assert.equal(c.closeMs, CLOSE - 1);
    assert.equal(c.open, 100.5);
    assert.equal(c.close, 103.25);
  });

  test("rejects when the target candle is absent", () => {
    assert.equal(pickBinanceCandle([other], OPEN), null);
  });

  test("rejects malformed payloads and bad prices", () => {
    assert.equal(pickBinanceCandle("nope", OPEN), null);
    assert.equal(pickBinanceCandle([[OPEN, "0", "1", "0", "0", "0", CLOSE - 1]], OPEN), null);
    assert.equal(pickBinanceCandle([[OPEN, "abc", "1", "0", "1", "0", CLOSE - 1]], OPEN), null);
  });
});

describe("bitget candle selection", () => {
  const payload = { code: "00000", data: [[String(OPEN), "200", "205", "198", "196.4", "10", "10"]] };

  test("selects the exact target candle and derives its UTC close", () => {
    const c = pickBitgetCandle(payload, OPEN);
    assert.ok(c);
    assert.equal(c.openMs, OPEN);
    assert.equal(c.closeMs, CLOSE - 1);
    assert.equal(c.open, 200);
    assert.equal(c.close, 196.4);
  });

  test("rejects error codes, wrong timestamps, and missing rows", () => {
    assert.equal(pickBitgetCandle({ code: "40001", data: [] }, OPEN), null);
    assert.equal(pickBitgetCandle({ code: "00000", data: [[String(OPEN + 1), "1", "1", "1", "1"]] }, OPEN), null);
    assert.equal(pickBitgetCandle({ code: "00000", data: [] }, OPEN), null);
    assert.equal(pickBitgetCandle(null, OPEN), null);
  });
});

describe("chart parsers (display layer)", () => {
  test("binance klines parse, validate, and sort ascending", () => {
    const payload = [
      [OPEN + DAY_MS, "101", "103", "100", "102.5", "9"],
      [OPEN, "100", "101", "99", "101", "10"],
      [OPEN - DAY_MS, "99", "100", "98", "100", "8"],
    ];
    const candles = parseBinanceKlines(payload)!;
    assert.equal(candles.length, 3);
    assert.deepEqual(candles.map((c) => c.t), [OPEN - DAY_MS, OPEN, OPEN + DAY_MS]);
    assert.deepEqual(candles[1], { t: OPEN, o: 100, h: 101, l: 99, c: 101 });
  });

  test("binance parser rejects malformed payloads", () => {
    assert.equal(parseBinanceKlines("nope"), null);
    assert.equal(parseBinanceKlines([]), null);
    assert.equal(parseBinanceKlines([[OPEN, "0", "1", "0", "0", "0"]]), null);
    assert.equal(parseBinanceKlines([[OPEN, "abc", "1", "1", "1", "0"]]), null);
  });

  test("bitget candles parse, validate, and sort ascending", () => {
    const payload = {
      code: "00000",
      data: [
        [String(OPEN + DAY_MS), "201", "205", "199", "204", "1"],
        [String(OPEN), "200", "202", "198", "201", "1"],
      ],
    };
    const candles = parseBitgetCandles(payload)!;
    assert.equal(candles.length, 2);
    assert.deepEqual(candles.map((c) => c.t), [OPEN, OPEN + DAY_MS]);
    assert.deepEqual(candles[0], { t: OPEN, o: 200, h: 202, l: 198, c: 201 });
  });

  test("bitget parser rejects error codes and bad rows", () => {
    assert.equal(parseBitgetCandles({ code: "40001", data: [] }), null);
    assert.equal(parseBitgetCandles({ code: "00000", data: [] }), null);
    assert.equal(parseBitgetCandles(null), null);
    assert.equal(parseBitgetCandles({ code: "00000", data: [[String(OPEN), "0", "1", "0", "0"]] }), null);
  });
});

describe("truth rule", () => {
  test("UP requires both sources up", () => {
    assert.equal(decideResolution("UP", "UP"), "UP");
    assert.equal(decideResolution("UP", "DOWN"), "INCONCLUSIVE");
    assert.equal(decideResolution("UP", "NONE"), "INCONCLUSIVE");
  });

  test("DOWN requires both sources down", () => {
    assert.equal(decideResolution("DOWN", "DOWN"), "DOWN");
    assert.equal(decideResolution("DOWN", "UP"), "INCONCLUSIVE");
    assert.equal(decideResolution("DOWN", "NONE"), "INCONCLUSIVE");
  });

  test("no-signal or flat candles are inconclusive", () => {
    assert.equal(decideResolution("NONE", "NONE"), "INCONCLUSIVE");
    assert.equal(decideResolution("NONE", "UP"), "INCONCLUSIVE");
    assert.equal(decideResolution("NONE", "DOWN"), "INCONCLUSIVE");
  });
});
