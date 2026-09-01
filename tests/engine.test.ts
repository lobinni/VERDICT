/**
 * Integration tests for the contract-mirror engine, exercising the exact
 * rules the Intelligent Contract enforces. Runs against PostgreSQL and
 * cleans up every fixture it creates.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CAROL = "0xcccccccccccccccccccccccccccccccccccccccc";

let engine: typeof import("../src/lib/engine");
let dbMod: typeof import("../src/db");
let schema: typeof import("../src/db/schema");

const createdMarketIds: number[] = [];

function must(err: unknown, code: string) {
  assert.ok(err instanceof Error, `expected error ${code}`);
  assert.equal((err as { code?: string }).code, code, `expected ${code}, got: ${String(err)}`);
}

before(async () => {
  engine = await import("../src/lib/engine");
  dbMod = await import("../src/db");
  schema = await import("../src/db/schema");
});

after(async () => {
  const { eq, inArray } = await import("drizzle-orm");
  if (createdMarketIds.length) {
    await dbMod.db.delete(schema.activity).where(inArray(schema.activity.marketId, createdMarketIds));
    await dbMod.db.delete(schema.positions).where(inArray(schema.positions.marketId, createdMarketIds));
    await dbMod.db.delete(schema.markets).where(inArray(schema.markets.id, createdMarketIds));
  }
  await dbMod.pool.end();
});

describe("open_market rules", () => {
  test("rejects invalid callers, symbols and dates", async () => {
    await engine.openMarket("not-an-address", "BTCUSDT", "2999-01-01").then(
      () => assert.fail("should reject"),
      (e) => must(e, "INVALID_SENDER"),
    );
    await engine.openMarket(ALICE, "DOGEUSDT", "2999-01-01").then(
      () => assert.fail("should reject"),
      (e) => must(e, "UNSUPPORTED_SYMBOL"),
    );
    await engine.openMarket(ALICE, "BTCUSDT", "01/01/2999").then(
      () => assert.fail("should reject"),
      (e) => must(e, "INVALID_DATE"),
    );
    await engine.openMarket(ALICE, "BTCUSDT", "2020-01-01").then(
      () => assert.fail("should reject"),
      (e) => must(e, "DATE_NOT_FUTURE"),
    );
  });

  test("creates a market and rejects duplicates", async () => {
    const date = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const market = await engine.openMarket(ALICE, "BTCUSDT", date);
    createdMarketIds.push(market.id);
    assert.equal(market.phase, "PREDICTION_OPEN");
    assert.equal(market.symbol, "BTCUSDT");

    await engine.openMarket(BOB, "BTCUSDT", date).then(
      () => assert.fail("dup should reject"),
      (e) => must(e, "MARKET_EXISTS"),
    );
  });

  test("rejects dates beyond the forward limit", async () => {
    const tooFar = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    await engine.openMarket(ALICE, "ETHUSDT", tooFar).then(
      () => assert.fail("should reject"),
      (e) => must(e, "DATE_TOO_FAR"),
    );
  });
});

describe("take_position rules", () => {
  let marketId: number;

  before(async () => {
    const date = new Date(Date.now() + 41 * 86_400_000).toISOString().slice(0, 10);
    const market = await engine.openMarket(ALICE, "SOLUSDT", date);
    marketId = market.id;
    createdMarketIds.push(market.id);
  });

  test("enforces the minimum stake", async () => {
    await engine.takePosition(ALICE, marketId, "UP", 0.5).then(
      () => assert.fail("should reject"),
      (e) => must(e, "BELOW_MINIMUM"),
    );
  });

  test("records sender-bound positions and pools", async () => {
    await engine.takePosition(ALICE, marketId, "UP", 3);
    await engine.takePosition(BOB, marketId, "DOWN", 4);
    const pools = await engine.getPools(marketId);
    assert.equal(pools.up, 3);
    assert.equal(pools.down, 4);
  });

  test("rejects side switching but allows same-side top-ups", async () => {
    await engine.takePosition(ALICE, marketId, "DOWN", 1).then(
      () => assert.fail("should reject"),
      (e) => must(e, "SIDE_SWITCH_REJECTED"),
    );
    await engine.takePosition(ALICE, marketId, "UP", 5);
    const pos = await engine.getPosition(marketId, ALICE);
    assert.equal(pos?.stake, 8);
  });

  test("enforces the cumulative cap", async () => {
    await engine.takePosition(ALICE, marketId, "UP", 5).then(
      () => assert.fail("cap should reject"),
      (e) => must(e, "POSITION_CAP_EXCEEDED"),
    );
  });

  test("rejects settlement and locking before their time", async () => {
    await engine.closeEntries(BOB, marketId).then(
      () => assert.fail("should reject"),
      (e) => must(e, "TOO_EARLY"),
    );
    await engine.resolveMarket(BOB, marketId).then(
      () => assert.fail("should reject"),
      (e) => must(e, "CANDLE_INCOMPLETE"),
    );
    await engine.claim(ALICE, marketId).then(
      () => assert.fail("should reject"),
      (e) => must(e, "NOT_RESOLVED"),
    );
  });
});

describe("settlement and claims", () => {
  let marketId: number;
  const staked: Record<string, { side: "UP" | "DOWN"; amount: number }> = {
    [ALICE]: { side: "UP", amount: 6 },
    [BOB]: { side: "UP", amount: 2 },
    [CAROL]: { side: "DOWN", amount: 4 },
  };
  const POOL = 12;

  before(async () => {
    // Fixture infra: a market whose candle completed two days ago.
    const marketDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const [m] = await dbMod.db
      .insert(schema.markets)
      .values({ symbol: "ETHUSDT", marketDate, createdBy: ALICE })
      .returning();
    marketId = m.id;
    createdMarketIds.push(marketId);
    for (const [addr, p] of Object.entries(staked)) {
      await dbMod.db
        .insert(schema.positions)
        .values({ marketId, address: addr, side: p.side, stake: p.amount });
    }
  });

  test("consensus resolves the market and stores evidence", async () => {
    const { view, evidence } = await engine.resolveMarket(BOB, marketId);
    assert.equal(view.status, "RESOLVED");
    assert.ok(["UP", "DOWN", "INCONCLUSIVE"].includes(evidence.resolution));
    assert.equal(evidence.validators.length, 5);
    // Live-data-only guarantee: sources are either verified with real prices
    // or explicitly failed — never substituted.
    for (const s of [evidence.binance, evidence.bitget]) {
      if (s.status === "OK") {
        assert.ok(s.open! > 0 && s.close! > 0);
        assert.equal(s.candleOpenMs, evidence.expectedCandleOpenMs);
      } else {
        assert.equal(s.direction, "NONE");
        assert.ok(s.reason);
      }
    }
    if (evidence.resolution !== "INCONCLUSIVE") {
      // Both sides carry stake in this fixture, so a directional verdict
      // cannot fall back to the refund path.
      assert.equal(view.refundAll, false);
    } else {
      assert.equal(view.refundAll, true);
    }

    await engine.resolveMarket(ALICE, marketId).then(
      () => assert.fail("double resolve should reject"),
      (e) => must(e, "ALREADY_RESOLVED"),
    );
  });

  test("claims follow the verdict, pay once, and never exceed the pool", async () => {
    const view = (await engine.getMarketDetail(marketId))!.view;
    let totalClaimed = 0;

    for (const [addr, p] of Object.entries(staked)) {
      const info = await engine.claimInfo(marketId, addr);
      if (view.refundAll) {
        assert.equal(info.kind, "REFUND");
        assert.equal(info.amount, p.amount);
        await engine.claim(addr, marketId);
        totalClaimed += p.amount;
      } else if (p.side === view.resolution) {
        assert.equal(info.kind, "PAYOUT");
        const expected = Math.floor((POOL * p.amount) / (view.resolution === "UP" ? 8 : 4) * 1e8) / 1e8;
        assert.ok(Math.abs(info.amount - expected) < 1e-6, `payout ${info.amount} ≈ ${expected}`);
        await engine.claim(addr, marketId);
        totalClaimed += info.amount;
      } else {
        assert.equal(info.kind, "NONE");
        await engine.claim(addr, marketId).then(
          () => assert.fail("losing side should not claim"),
          (e) => must(e, "NOTHING_TO_CLAIM"),
        );
      }
    }
    assert.ok(totalClaimed <= POOL + 1e-8, "claims never exceed the pool");

    const claimed = await engine.getPosition(marketId, ALICE);
    assert.equal(claimed?.claimed, true);
    await engine.claim(ALICE, marketId).then(
      () => assert.fail("double claim should reject"),
      (e) => must(e, "ALREADY_CLAIMED"),
    );
    await engine.claim("0xdddddddddddddddddddddddddddddddddddddddd", marketId).then(
      () => assert.fail("no position should reject"),
      (e) => must(e, "NO_POSITION"),
    );
  });

  test("portfolio reflects outcomes", async () => {
    const p = await engine.getPortfolio(ALICE);
    const item = p.items.find((i) => i.market.id === marketId);
    assert.ok(item);
    assert.equal(item.position.claimed, true);
    assert.equal(item.market.status, "RESOLVED");
  });
});
