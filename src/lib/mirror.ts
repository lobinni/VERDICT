// Mirror layer: records observed on-chain activity into the local
// zero-config store so the interface can show counts, a positions list, and
// an activity feed alongside the canonical chain state. Mirrors never judge:
// every value is copied verbatim from chain read-backs after MetaMask-signed
// writes. The contract remains the only source of truth.

import { isAddress } from "./format";
import { getStore } from "./store";

export class MirrorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MirrorError";
  }
}

function requireAddress(address: unknown): string {
  if (typeof address !== "string" || !isAddress(address)) throw new MirrorError("A valid address is required.");
  return address.toLowerCase();
}

function requirePair(symbol: unknown, marketDate: unknown): { symbol: string; marketDate: string } {
  if (typeof symbol !== "string" || !symbol) throw new MirrorError("symbol is required.");
  if (typeof marketDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(marketDate))
    throw new MirrorError("a canonical marketDate is required.");
  return { symbol: symbol.toUpperCase(), marketDate };
}

async function upsertMarket(symbol: string, marketDate: string, address: string) {
  const store = getStore();
  const existing = await store.findMarket(symbol, marketDate);
  if (existing) return { row: existing, created: false };
  const row = await store.createMarket({ symbol, marketDate, createdBy: address });
  await store.log({ kind: "MARKET_CREATED", marketId: row.id, address, data: { symbol, marketDate } });
  return { row, created: true };
}

export type MirrorPositionPayload = {
  symbol: unknown;
  marketDate: unknown;
  address: unknown;
  side: unknown;
  /** Cumulative stake in GEN as read back from the chain (authoritative). */
  stake: unknown;
  /** The amount just added in this transaction, for the activity feed. */
  delta: unknown;
};

export async function mirrorPosition(p: MirrorPositionPayload) {
  const address = requireAddress(p.address);
  const { symbol, marketDate } = requirePair(p.symbol, p.marketDate);
  if (p.side !== "UP" && p.side !== "DOWN") throw new MirrorError("side must be UP or DOWN.");
  const stake = Number(p.stake);
  const delta = Number(p.delta);
  if (!Number.isFinite(stake) || stake <= 0) throw new MirrorError("stake must be positive.");
  if (!Number.isFinite(delta) || delta < 0) throw new MirrorError("delta must be zero or positive.");

  const store = getStore();
  const { row } = await upsertMarket(symbol, marketDate, address);
  const existing = await store.getPosition(row.id, address);
  if (existing) {
    await store.updatePosition(existing.id, { stake });
  } else {
    await store.insertPosition({ marketId: row.id, address, side: p.side, stake });
  }
  await store.log({
    kind: "POSITION_TAKEN",
    marketId: row.id,
    address,
    data: { side: p.side, amount: delta },
  });
  return { mirrored: true };
}

export type MirrorResolvePayload = {
  symbol: unknown;
  marketDate: unknown;
  address: unknown;
  resolution: unknown;
  refundAll: unknown;
  evidence: unknown;
};

export async function mirrorResolve(p: MirrorResolvePayload) {
  const address = requireAddress(p.address);
  const { symbol, marketDate } = requirePair(p.symbol, p.marketDate);
  if (p.resolution !== "UP" && p.resolution !== "DOWN" && p.resolution !== "INCONCLUSIVE")
    throw new MirrorError("invalid resolution.");

  const store = getStore();
  const { row } = await upsertMarket(symbol, marketDate, address);
  await store.updateMarket(row.id, {
    status: "RESOLVED",
    resolution: p.resolution as string,
    refundAll: Boolean(p.refundAll),
    evidence: p.evidence as never,
    resolvedAt: new Date(),
  });
  await store.log({
    kind: "MARKET_RESOLVED",
    marketId: row.id,
    address,
    data: { resolution: p.resolution, refundAll: Boolean(p.refundAll), onChain: true },
  });
  return { mirrored: true };
}

export type MirrorClaimPayload = {
  symbol: unknown;
  marketDate: unknown;
  address: unknown;
  amount: unknown;
  kind: unknown;
};

export async function mirrorClaim(p: MirrorClaimPayload) {
  const address = requireAddress(p.address);
  const { symbol, marketDate } = requirePair(p.symbol, p.marketDate);
  const amount = Number(p.amount);
  const kind = p.kind === "REFUND" ? "REFUND" : "PAYOUT";
  if (!Number.isFinite(amount) || amount <= 0) throw new MirrorError("amount must be positive.");

  const store = getStore();
  const { row } = await upsertMarket(symbol, marketDate, address);
  const existing = await store.getPosition(row.id, address);
  if (existing) await store.updatePosition(existing.id, { claimed: true });
  await store.log({ kind: "CLAIMED", marketId: row.id, address, data: { amount, kind } });
  return { mirrored: true };
}
