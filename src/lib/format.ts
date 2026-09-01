// Display formatting helpers (client-safe, no node deps).

/** Round a GEN amount to 8 decimal places (contract fixed-point). */
export function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** "10.5" | "3.04" | "2" — trims trailing zeros, keeps up to 4 dp. */
export function fmtGen(n: number | null | undefined, dp = 4): string {
  if (n == null || Number.isNaN(n)) return "0";
  const fixed = n.toFixed(dp);
  return fixed.replace(/\.?0+$/, "");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "0x7a1F…9c04" */
export function shortAddr(address: string, left = 6, right = 4): string {
  if (!address) return "";
  if (address.length <= left + right + 1) return address;
  return `${address.slice(0, left)}…${address.slice(-right)}`;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 50;
  return Math.round((part / whole) * 100);
}
