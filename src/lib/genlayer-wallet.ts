"use client";

// Client-side write path: the wallet (MetaMask) signs real transactions to
// the deployed Intelligent Contract on GenLayer Bradbury. Chain state is
// canonical — the local mirror only observes. Flow per action:
//   1. ensure the MetaMask network is Bradbury (chain 4221)
//   2. preflight with a read-only simulation so contract rule violations
//      surface as clean messages instead of a failed transaction
//   3. submit the write and wait for validator ACCEPTANCE
//   4. read back the fresh on-chain state and mirror it for the interface

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { NETWORK } from "./constants";
import { isUserRejection } from "./ethereum";

const CONTRACT = NETWORK.contract as `0x${string}`;
const ONE_GEN_WEI = 1_000_000_000_000_000_000n;

export function chainReady(): boolean {
  return CONTRACT.startsWith("0x") && CONTRACT.length === 42;
}

/** Exact GEN → wei conversion without float rounding drift. */
export function genToWei(genAmount: number): bigint {
  const negative = genAmount < 0;
  const abs = Math.abs(genAmount);
  const [whole, fractionRaw = ""] = abs.toFixed(8).split(".");
  const fraction = (fractionRaw + "00000000").slice(0, 8);
  const base = BigInt(whole) * 100_000_000n + BigInt(fraction);
  const result = base * (ONE_GEN_WEI / 100_000_000n);
  return negative ? -result : result;
}

export class ChainWriteError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ChainWriteError";
    this.code = code;
  }
}

/** Node-side throttling: Bradbury validators answer -32005 when at capacity. */
const RATE_LIMIT_PATTERN = /-32005|rate limit|node is at capacity|retry in|too many requests|429\b/i;

function isRateLimitError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_PATTERN.test(raw);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Plain JSON-RPC helper for preflight queries outside the SDK's typed surface. */
async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(NETWORK.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

/**
 * Retry transient RPC throttling with exponential backoff. Signing-enabled
 * attempts may prompt the wallet more than once when the node is saturated —
 * that is expected behavior under capacity spikes, and the stage surface
 * stays on "consensus" until the final attempt.
 */
async function withBackoff<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === attempts) throw err;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(500 * attempt + jitter);
    }
  }
  throw lastError;
}

/** Pull a readable rule reason out of a GenLayer UserError dump. */
function extractUserError(raw: string): string | null {
  const match = raw.match(/\[[A-Z]+\]\s+([^\\\x5d"]+)/);
  if (!match) return null;
  const text = match[1].trim();
  return text.length > 0 && text.length < 160 ? text : null;
}

function toFriendlyError(err: unknown): ChainWriteError {
  if (err instanceof ChainWriteError) return err;
  if (isUserRejection(err)) return new ChainWriteError("USER_REJECTED", "The transaction was rejected in MetaMask.");
  const raw = err instanceof Error ? err.message : String(err);
  if (/insufficient (funds|balance)|enough funds|cover transaction fees/i.test(raw))
    return new ChainWriteError(
      "NO_FUNDS",
      "This address has no GEN for network fees (each on-chain action costs a small fee). Claim test GEN from the official GenLayer faucet, then try again.",
    );
  if (/wallet is on chain/i.test(raw))
    return new ChainWriteError("WRONG_CHAIN", "MetaMask is on the wrong network. Switch it to GenLayer Bradbury (chain 4221).");
  if (isRateLimitError(err))
    return new ChainWriteError(
      "NODE_BUSY",
      "The Bradbury validators are at capacity right now — the app retried automatically several times. Please try again in about a minute.",
    );
  const rule = extractUserError(raw);
  if (rule) return new ChainWriteError("CONTRACT_RULE", `Contract rejected the call: ${rule}`);
  return new ChainWriteError("WRITE_FAILED", raw.slice(0, 220) || "The transaction could not be submitted.");
}

/** Switch MetaMask to Bradbury (chain 4221), adding the network if needed. */
async function ensureNetwork(): Promise<void> {
  const eth = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown> } }).ethereum;
  if (!eth) throw new ChainWriteError("NO_WALLET", "MetaMask was not detected in this browser.");
  const chainId = (NETWORK.chainId || "0x107d").toLowerCase();

  const current = String(await eth.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== chainId) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (err) {
      const code = (err as { code?: number } | null)?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId,
              chainName: NETWORK.name,
              nativeCurrency: { name: "GEN", symbol: NETWORK.currencySymbol, decimals: 18 },
              rpcUrls: [NETWORK.rpc],
              blockExplorerUrls: [NETWORK.explorer],
            },
          ],
        });
        // Some wallets add the chain without switching to it — request it again.
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
      } else if (isUserRejection(err)) {
        throw new ChainWriteError("USER_REJECTED", "The network switch was rejected in MetaMask.");
      }
    }
  }
}

export type WriteStage = "preflight" | "submitted" | "consensus" | "done";

/** Submit one write to the contract and wait for validator acceptance. */
export async function writeContractCall(
  address: string,
  functionName: string,
  args: unknown[],
  valueWei: bigint = 0n,
  onStage?: (stage: WriteStage) => void,
): Promise<unknown> {
  if (!chainReady()) throw new ChainWriteError("NO_CONTRACT", "No contract address is configured.");
  await ensureNetwork();

  const client = createClient({ chain: testnetBradbury, account: address as `0x${string}` });
  try {
    // Fail fast with exact numbers when the wallet cannot cover the value
    // plus network fees: MetaMask would otherwise simulate the send, see the
    // shortfall, and fail with an opaque "Transaction failed" error. Write
    // fees on Bradbury are a small fraction of 1 GEN; the stake itself is the
    // big number, so the balance must clear stake + generous fee headroom.
    const balance = await withBackoff(() => rpcCall<string>("eth_getBalance", [address, "latest"]), 4);
    const balanceWei = BigInt(balance ?? "0");
    const GAS_HEADROOM = 100_000_000_000_000_000n; // 0.1 GEN — far above the measured write fee
    if (balanceWei < valueWei + GAS_HEADROOM) {
      const have = (Number(balanceWei) / 1e18).toFixed(4).replace(/\.?0+$/, "");
      const need = ((Number(valueWei + GAS_HEADROOM) / 1e18)).toFixed(2).replace(/\.?0+$/, "");
      throw new ChainWriteError(
        "NO_FUNDS",
        `Balance is ${have || "0"} GEN — this action needs about ${need} GEN (stake plus network fees). Claim 100 GEN free from the official faucet, then try again.`,
      );
    }
  } catch (err) {
    throw toFriendlyError(err);
  }

  try {
    // Preflight only when no value is attached: the payable check reads
    // gl.message.value, which a stateless simulation reports as zero — any
    // payable call would be spuriously rejected by simulation. The call is
    // wrapped with backoff because node throttling can hit the simulation
    // RPC as well.
    if (valueWei === 0n) {
      onStage?.("preflight");
      await withBackoff(() =>
        client.simulateWriteContract({ address: CONTRACT, functionName, args: args as never }),
      );
    }
    onStage?.("submitted");
    const hash = await withBackoff(() =>
      client.writeContract({
        address: CONTRACT,
        functionName,
        args: args as never,
        value: valueWei,
      }),
    );
    onStage?.("consensus");
    const receipt = await withBackoff(() =>
      client.waitForTransactionReceipt({
        hash: hash as never,
        status: TransactionStatus.ACCEPTED,
        interval: 2500,
        retries: 120,
      }),
    );
    onStage?.("done");
    return receipt;
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Best-effort mirror; failures never block the confirmed on-chain action. */
export async function mirrorPost(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/mirror", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* observable-only */
  }
}

/** Read-back helper for the browser (fresh chain truth after a write). */
export async function readContractView<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const client = createClient({ chain: testnetBradbury });
  return (await withBackoff(() =>
    client.readContract({ address: CONTRACT, functionName, args: args as never }),
  4)) as T;
}
