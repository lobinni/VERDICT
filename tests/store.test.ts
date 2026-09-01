/**
 * Unit tests for the zero-configuration in-memory storage backend — the
 * store that lets the app run on Vercel without any DATABASE_URL.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createMemoryStore } from "../src/lib/store";

describe("in-memory store backend", () => {
  async function fresh() {
    // Isolated store instance per suite via a fresh global state injection.
    const g = globalThis as typeof globalThis & { __verdictMemoryState?: unknown };
    const saved = g.__verdictMemoryState;
    g.__verdictMemoryState = undefined;
    const store = createMemoryStore();
    return { store, restore: () => (g.__verdictMemoryState = saved) };
  }

  test("markets: create, list sorted, duplicate lookup, patch", async () => {
    const { store, restore } = await fresh();
    try {
      const m2 = await store.createMarket({ symbol: "ETHUSDT", marketDate: "2026-09-04", createdBy: "0xabc" });
      const m1 = await store.createMarket({ symbol: "BTCUSDT", marketDate: "2026-09-03", createdBy: "0xabc" });

      const listed = await store.listMarkets();
      assert.deepEqual(listed.map((m) => m.id), [m1.id, m2.id]); // sorted by date then id

      assert.equal((await store.findMarket("BTCUSDT", "2026-09-03"))?.id, m1.id);
      assert.equal(await store.findMarket("BTCUSDT", "2026-09-04"), null);

      await store.updateMarket(m1.id, { status: "RESOLVED", resolution: "UP", refundAll: false });
      const updated = await store.getMarket(m1.id);
      assert.equal(updated?.status, "RESOLVED");
      assert.equal(updated?.resolution, "UP");
    } finally {
      restore();
    }
  });

  test("positions: insert, aggregate stakes, ordered lists, in-place patch", async () => {
    const { store, restore } = await fresh();
    try {
      const m = await store.createMarket({ symbol: "BTCUSDT", marketDate: "2026-09-03", createdBy: "0xabc" });
      const p1 = await store.insertPosition({ marketId: m.id, address: "0xaaa", side: "UP", stake: 2 });
      await store.insertPosition({ marketId: m.id, address: "0xbbb", side: "DOWN", stake: 7 });

      const mine = await store.getPosition(m.id, "0xaaa");
      assert.equal(mine?.stake, 2);

      await store.updatePosition(p1.id, { stake: 9 });
      assert.equal((await store.getPosition(m.id, "0xaaa"))?.stake, 9);

      // market list ordered by stake desc; address list ordered by updatedAt desc
      assert.deepEqual((await store.listPositions(m.id)).map((p) => p.address), ["0xaaa", "0xbbb"]);
      assert.deepEqual((await store.listPositionsForAddress("0xbbb")).map((p) => p.stake), [7]);

      assert.equal(await store.sumPositionStakes(), 16);

      await store.updatePosition(p1.id, { claimed: true });
      assert.equal((await store.getPosition(m.id, "0xaaa"))?.claimed, true);
    } finally {
      restore();
    }
  });

  test("activity: joining market fields, limiting, payout sums", async () => {
    const { store, restore } = await fresh();
    try {
      const m = await store.createMarket({ symbol: "SOLUSDT", marketDate: "2026-09-05", createdBy: "0xabc" });
      await store.log({ kind: "MARKET_CREATED", marketId: m.id, address: "0xabc", data: { symbol: m.symbol } });
      await store.log({ kind: "CLAIMED", marketId: m.id, address: "0xabc", data: { amount: 6.5, kind: "PAYOUT" } });
      await store.log({ kind: "CLAIMED", marketId: m.id, address: "0xdef", data: { amount: 2, kind: "REFUND" } });

      const feed = await store.listActivity(60);
      assert.equal(feed.length, 3);
      assert.deepEqual(feed.map((a) => a.kind), ["CLAIMED", "CLAIMED", "MARKET_CREATED"]); // newest first
      assert.equal(feed[0].symbol, "SOLUSDT");
      assert.equal(feed[1].marketDate, "2026-09-05");

      assert.equal((await store.listActivity(1)).length, 1);
      assert.equal(await store.sumClaimedPayouts(), 8.5);
    } finally {
      restore();
    }
  });
});
