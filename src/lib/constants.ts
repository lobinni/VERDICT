// Contract-level configuration, mirroring the on-chain constants in
// contracts/Verdict.py. The contract's SUPPORTED tuple is the single source
// of truth — every entry must be a futures pair listed on BOTH locked
// settlement venues (Binance USD-M Futures and Bitget USDT Futures), so that
// two-source directional agreement is actually reachable.

export const SUPPORTED_SYMBOLS = [
  { symbol: "BTCUSDT", ticker: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSDT", ticker: "ETH", name: "Ethereum" },
  { symbol: "SOLUSDT", ticker: "SOL", name: "Solana" },
  { symbol: "BNBUSDT", ticker: "BNB", name: "BNB" },
] as const;

export type SupportedSymbol = (typeof SUPPORTED_SYMBOLS)[number];

export function symbolMeta(symbol: string): SupportedSymbol | undefined {
  return SUPPORTED_SYMBOLS.find((s) => s.symbol === symbol);
}

export function isSupportedSymbol(symbol: string): boolean {
  return SUPPORTED_SYMBOLS.some((s) => s.symbol === symbol);
}

/** Minimum single stake, in GEN. */
export const MIN_POSITION_GEN = 1;
/** Maximum cumulative stake per wallet per market, in GEN. */
export const MAX_POSITION_GEN = 10;
/** open_market accepts at most this many days into the future. */
export const OPEN_LIMIT_DAYS = 366;
/** Optimistic Democracy validator set size for a settlement round. */
export const VALIDATOR_COUNT = 5;

/**
 * Network parameters. Chain id and contract address come from public env
 * vars (see .env.example and docs/contract.md): fill NEXT_PUBLIC_GL_CHAIN_ID
 * from the official network configuration once Bradbury publishes it, and
 * NEXT_PUBLIC_GL_CONTRACT_ADDRESS after deploying contracts/Verdict.py from
 * GenLayer Studio. No network values are invented here.
 */
/** Empty-string env values must never defeat the defaults ("" ?? x returns ""). */
function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

export const NETWORK = {
  name: "GenLayer Bradbury Testnet",
  shortName: "Bradbury",
  /** Official Bradbury chain id (4221), verified against the RPC and SDK. */
  chainId: envOr("NEXT_PUBLIC_GL_CHAIN_ID", "0x107d"),
  rpc: envOr("NEXT_PUBLIC_GL_RPC_URL", "https://rpc-bradbury.genlayer.com"),
  explorer: envOr("NEXT_PUBLIC_GL_EXPLORER_URL", "https://explorer-bradbury.genlayer.com"),
  currencySymbol: "GEN",
  /** Deployed Verdict contract on Bradbury (public information — env may override). */
  contract: envOr("NEXT_PUBLIC_GL_CONTRACT_ADDRESS", "0x5056ad2dFf0a132c42806c2efaEb206743186E0b"),
  studio: "https://studio.genlayer.com",
  docs: "https://docs.genlayer.com",
  faucet: "https://testnet-faucet.genlayer.foundation/",
  portal: "https://portal.genlayer.foundation/builders/resources",
} as const;
