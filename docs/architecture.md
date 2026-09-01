# Verdict — Architecture

This document explains how the pieces fit together, which component owns which
rule, and how the system behaves in production on GenLayer Bradbury versus in
this local fullstack environment.

## Components

```
┌────────────────────────────────────────────────────────────────────────┐
│ Participant (browser + MetaMask, EIP-1193)                             │
│   identity = connected account · balance read on-chain (eth_getBalance)│
└───────────────┬────────────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────────────┐
│ Interface + indexer (this Next.js application)                          │
│   src/app            App Router UI + REST surface                       │
│   src/lib/engine.ts  deterministic mirror of the contract's writes      │
│   src/lib/evidence.ts two-source consensus over live exchange data      │
│   src/db (Drizzle)   PostgreSQL mirror of contract storage              │
└───────────────┬────────────────────────────────────────────────────────┘
                │ same rules, same evidence feed
┌───────────────▼────────────────────────────────────────────────────────┐
│ Intelligent Contract: contracts/Verdict.py (GenVM, Bradbury testnet)    │
│   TreeMap storage · payable positions · claims & refunds · strict_eq    │
└───────────────┬────────────────────────────────────────────────────────┘
                │ nondeterministic boundary (gl.nondet.web.get)
┌───────────────▼────────────────────────────────────────────────────────┐
│ Locked evidence sources                                                 │
│   Binance USD-M Futures  daily klines        (interval 1d)              │
│   Bitget USDT Futures    daily candles, UTC  (granularity 1Dutc)        │
└────────────────────────────────────────────────────────────────────────┘
```

## Production write path (Bradbury) — the default, live mode

The default operating mode is **wallet → contract directly**, with no
custodial backend:

1. The browser connects MetaMask (EIP-1193) and requires no other wallet;
   the app switches MetaMask to Bradbury (chain 4221) when needed.
2. Every write (`open_market`, `take_position`, `close_entries`,
   `resolve_market`, `claim`) is preflighted with a read-only simulation so
   contract rule violations surface as clean messages, then submitted via
   genlayer-js with MetaMask signing, and awaited to validator acceptance.
   `take_position` is payable — the stake is the transaction value.
3. Pages read markets, pools, positions, claims, and settlement evidence
   directly from the contract's view methods (`src/lib/chain.ts`). The
   zero-config store serves as an observability mirror (`src/lib/mirror.ts`)
   for counts, lists, and the activity feed — never as authority.
4. If the RPC is unreachable, the interface falls back to its local engine
   (demo mode) and recovers automatically. Payouts are native GEN transfers
   emitted by the contract's ghost contract to the position owner.

## Storage roles

- **Canonical**: the contract's TreeMap storage on Bradbury — read live via
  genlayer-js.
- **Mirror (optional, zero-config)**: in-memory by default, PostgreSQL when
  `DATABASE_URL` is set. Records observed actions verbatim after MetaMask
  confirmations for counts, positions lists, and activity. Losing it loses
  nothing authoritative.

## Local engine mirror (this application)

The contract is the canonical record; a database is **optional**. The storage
layer (`src/lib/store.ts`) presents one engine API with two interchangeable
backends — durable PostgreSQL when `DATABASE_URL` is configured, otherwise a
zero-configuration in-memory store (process-local, reset on restart, flagged
in the interface footer). A stateless Vercel deployment therefore needs
nothing but the repository.

The Next.js app exists so the interface is instant and rich without bending
any contract rule:

- `engine.ts` re-implements the contract's five write methods 1:1 —
  identical validation order, identical limits (1–10 GEN, no side switching,
  canonical dates, 366-day bound), identical payout math (integer
  division, mark-before-pay claims).
- `evidence.ts` runs the same leader/validator flow the contract encodes:
  fetch the two locked sources, select the exact target UTC candle,
  normalize a fixed-point record, require exact cross-source directional
  agreement. **Only live data is fetched.** Unreachable or missing data is
  reported as failed evidence and the truth rule takes over — nothing is
  substituted, synthesized, or "seeded".
- PostgreSQL stores markets, positions, and an activity log. It never stores
  GEN balances or any information that only the chain can know.

## Consensus model

Settlement follows Optimistic Democracy: one leader proposes the normalized
evidence record; the validator set independently re-derives it from the same
locked sources and applies the Equivalence Principle (strict equality over
the normalized record: pair, date, candle window, fixed-point prices,
source statuses, directions, proposed verdict). Only matching evidence
becomes settlement state.

Truth rule (no single-source fallback):

| Binance     | Bitget          | Verdict       |
| ----------- | --------------- | ------------- |
| UP          | UP              | UP            |
| DOWN        | DOWN            | DOWN          |
| anything else (incl. failures, flat candles, missing timestamps) | | INCONCLUSIVE |

`INCONCLUSIVE` refunds every stake. A directional verdict with zero stake on
the winning side keeps its recorded verdict but also follows the refund path.

## Wallet & network

- Identity: `eth_requestAccounts` via MetaMask. The app reacts to account and
  chain changes and never stores keys.
- Balance: `eth_getBalance` on the connected chain, rendered in GEN.
- Network parameters (chain id, RPC, explorer, deployed contract address) are
  public environment variables — see `.env.example`. The chain id is taken
  from the official Bradbury network configuration; it is not hard-coded or
  guessed.
- Test GEN comes exclusively from the official GenLayer faucet.

## Data integrity rules

1. No fabricated data: no seed fixtures, no random walks, no simulated
   candles, no invented validator identities or prices.
2. Display-only surfaces (charts) show real venue data or an explicit
   "unavailable" state.
3. Time is canonical UTC: candle window = `YYYY-MM-DD 00:00:00 → next
   midnight`. The contract reads protocol transaction time; the interface
   never imposes a local clock on consensus.
