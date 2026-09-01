// Shared domain types mirroring the Verdict Intelligent Contract state model.
// The PostgreSQL tables act as the contract's indexed TreeMap storage; these
// types describe the values exchanged between the "contract" engine and the UI.

export type Resolution = "UP" | "DOWN" | "INCONCLUSIVE";
export type MarketStatus = "OPEN" | "LOCKED" | "RESOLVED";
export type Side = "UP" | "DOWN";

// Read-model phases exposed by the contract read API:
//   get_market_status -> PREDICTION_OPEN | CANDLE_IN_PROGRESS | READY_TO_RESOLVE | SETTLED | REFUND
export type MarketPhase =
  | "PREDICTION_OPEN"
  | "CANDLE_IN_PROGRESS"
  | "READY_TO_RESOLVE"
  | "SETTLED"
  | "REFUND";

export type SourceName = "BINANCE" | "BITGET";

/** Normalized, bounded per-source candle evidence (what a validator returns). */
export type SourceEvidence = {
  source: SourceName;
  endpoint: string;
  params: Record<string, string>;
  status: "OK" | "ERROR";
  /** Machine-readable rejection reason when status is ERROR. */
  reason: string | null;
  candleOpenMs: number | null;
  candleCloseMs: number | null;
  open: number | null;
  close: number | null;
  direction: "UP" | "DOWN" | "NONE";
};

export type ValidatorVote = {
  index: number;
  role: "LEADER" | "VALIDATOR";
  /** Plain display label, e.g. "Leader" / "Validator 2" — no invented identities. */
  label: string;
  agree: boolean;
  votedAtMs: number;
};

/** Consensus-critical settlement state stored on-chain after resolve_market. */
export type SettlementEvidence = {
  symbol: string;
  marketDate: string;
  expectedCandleOpenMs: number;
  expectedCandleCloseMs: number;
  binance: SourceEvidence;
  bitget: SourceEvidence;
  resolution: Resolution;
  /** Human-readable rule evaluation, e.g. "UP+UP => UP". */
  rule: string;
  validators: ValidatorVote[];
  consensusReached: boolean;
  settledAtMs: number;
};

export type MarketView = {
  id: number;
  symbol: string;
  ticker: string;
  name: string;
  marketDate: string;
  status: MarketStatus;
  resolution: Resolution | null;
  refundAll: boolean;
  phase: MarketPhase;
  candleOpenMs: number;
  candleCloseMs: number;
  upPool: number;
  downPool: number;
  totalPool: number;
  upPositions: number;
  downPositions: number;
  positionCount: number;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type PositionView = {
  id: number;
  marketId: number;
  address: string;
  side: Side;
  stake: number;
  claimed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActivityView = {
  id: number;
  kind:
    | "MARKET_CREATED"
    | "POSITION_TAKEN"
    | "ENTRIES_CLOSED"
    | "MARKET_RESOLVED"
    | "CLAIMED";
  marketId: number | null;
  address: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};
