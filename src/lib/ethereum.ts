"use client";

/** Minimal EIP-1193 (MetaMask) provider access. No injected demo wallets. */
export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

export function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

/** Convert a hex wei balance (eth_getBalance) to a trimmed GEN decimal string. */
export function weiHexToGen(weiHex: string, dp = 4): string {
  try {
    const wei = BigInt(weiHex);
    const base = 10n ** 18n;
    const whole = wei / base;
    const frac = wei % base;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return "0";
  }
}

export function isUserRejection(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 4001;
}
