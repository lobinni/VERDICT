# VERDICT — Daily Candle Markets Settled by GenLayer Consensus

Permissionless UP/DOWN prediction markets on the **GenLayer Bradbury testnet**.
Participants stake native GEN — through **MetaMask only** — on whether a
supported futures pair's target UTC daily candle closes **UP** or **DOWN**.
Settlement is produced by a GenLayer **Intelligent Contract** through
two-source validator consensus over **Binance USD-M Futures** and
**Bitget USDT Futures** candle evidence.

> No oracle. No admin key. No fabricated data. If evidence cannot be fetched,
> the market resolves INCONCLUSIVE and every stake is refunded — the absence of
> data is itself an honest verdict.

---

## Deployed Contract (live on Bradbury)

| Setting   | Value                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Contract  | `0x5056ad2dFf0a132c42806c2efaEb206743186E0b`                                                                |
| Explorer  | [View on Bradbury Explorer](https://explorer-bradbury.genlayer.com/address/0x5056ad2dFf0a132c42806c2efaEb206743186E0b) |
| Network   | GenLayer Bradbury Testnet                                                                                   |
| RPC       | `https://rpc-bradbury.genlayer.com`                                                                         |
| Source    | [`contracts/Verdict.py`](contracts/Verdict.py) — ABI: 31 methods (5 writes, 26 reads)                        |

## How Settlement Works

When a market's target UTC daily candle completes, anyone may request
settlement. The leader validator fetches both locked venues, normalizes a
fixed-point evidence record, and every validator independently re-derives it;
the record is accepted only when all consensus-critical fields match exactly.

Truth rule — **no single-source fallback**:

| Binance candle | Bitget candle       | Verdict       |
| -------------- | ------------------- | ------------- |
| Higher close   | Higher close        | UP            |
| Lower close    | Lower close         | DOWN          |
| Anything else  | (missing, malformed, flat, mistimed, outage) | INCONCLUSIVE |

INCONCLUSIVE refunds every stake. A directional verdict with no winning-side
stake also pays full refunds while keeping its recorded verdict. Winners split
the full pool proportionally: `payout = pool × stake ÷ winning-side stake` —
integer division; a claim succeeds exactly once, owner-only.

## Features

- **MetaMask-only identity (EIP-1193)** — account connection, on-chain GEN
  balance, account/chain change handling, and Bradbury network switching.
  No demo wallets, no custodial balances.
- **Live market charts** — real quotes refreshed every few seconds with 24h
  change, high/low, volume, OHLC tooltips, crosshair, and a live running
  candle. Multi-source by design (**Binance Spot → Bitget → OKX → Gate**),
  each render labeled with the venue that produced it.
- **Full market lifecycle** — create permissionlessly, stake 1–10 GEN per
  position (no side switching), lock, settle through consensus, claim payouts
  or refunds. Sender-bound positions and claims throughout.
- **Consensus transparency** — every settlement ships the Binance × Bitget
  evidence, validators' votes, the truth-rule evaluation, and a lifecycle
  timeline.
- **Honest by construction** — no seed fixtures, no simulated feeds, no
  invented validators or prices; unavailable data is stated plainly.
- **Plain-language UI** — English, no code-styled text anywhere.

## Repository Structure

```
verdict/
├── contracts/
│   └── Verdict.py            # GenLayer Intelligent Contract (deployed on Bradbury)
├── docs/
│   ├── architecture.md       # System design: contract, indexer, wallet flow, data integrity
│   ├── contract.md           # Contract API reference + Studio deployment + verification
│   ├── deployment.md         # GitHub → Vercel guide, database setup, env vars
│   └── testing.md            # Test suites and GenLayer-side verification
├── src/
│   ├── app/                  # Next.js App Router UI + REST surface mirroring the contract
│   ├── components/           # Interface (MetaMask wallet, live chart, consensus panels)
│   ├── db/                   # Drizzle schema + lazy PostgreSQL client (Vercel-safe)
│   └── lib/
│       ├── engine.ts         # Deterministic mirror of the contract's write methods
│       ├── evidence.ts       # Two-source validator consensus (locked fixture venues)
│       ├── quotes.ts         # Multi-exchange live quotes/candles for the display layer
│       ├── ethereum.ts       # EIP-1193 (MetaMask) helpers
│       ├── constants.ts      # Supported pairs, limits, network parameters
│       ├── time.ts           # Canonical UTC candle-window helpers
│       └── types.ts          # Shared domain types
└── tests/
    ├── evidence.test.ts      # Candle selection, validation, and truth-rule tests
    ├── quotes.test.ts        # Exchange parser tests (Binance, Bitget, OKX, Gate)
    └── engine.test.ts        # End-to-end lifecycle tests against PostgreSQL
```

## Quickstart (local)

```bash
npm install
npx drizzle-kit push          # create indexer tables in PostgreSQL
npm run dev                   # http://localhost:3000
```

Then: connect MetaMask, get test GEN from the official GenLayer faucet, open
a market on the Create page, and stake on your side.

## Environment Variables

| Variable                        | Required | Purpose                                                                 |
| ------------------------------- | -------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                  | Optional | Durable PostgreSQL for the indexer mirror — unset means zero-config in-memory storage (no database needed to deploy) |
| `NEXT_PUBLIC_GL_CONTRACT_ADDRESS` | Yes    | Deployed contract (pre-filled with the reference deployment)             |
| `NEXT_PUBLIC_GL_RPC_URL`        | No       | Bradbury RPC endpoint                                                    |
| `NEXT_PUBLIC_GL_EXPLORER_URL`   | No       | Bradbury explorer base URL                                               |
| `NEXT_PUBLIC_GL_CHAIN_ID`       | No       | From the official network config — enables MetaMask chain switching      |

See [`.env.example`](.env.example) for the exact template.

## Push to GitHub

```bash
git init
git add -A
git commit -m "Verdict — daily candle markets settled by GenLayer consensus"
git branch -M main
git remote add origin https://github.com/<your-username>/verdict.git
git push -u origin main
```

Create the empty repository on github.com first (do not initialize it — the
push above populates it). The committed `.gitignore` already excludes
`node_modules`, `.next`, and `.env`, so secrets never leave your machine;
`.env.example` is committed as the reference template.

## Deploy to Vercel

1. vercel.com → **Add New… → Project** → import the GitHub repository
   (Next.js is detected automatically).
2. Add a database: **Storage → Create Database → Postgres** (auto-injects
   `DATABASE_URL`), or paste any PostgreSQL connection string into the
   environment variables.
   **For Supabase**: use the *Session pooler* string from the Connect dialog
   and append `?sslmode=require` — see the dedicated notes and the
   troubleshooting table in [`docs/deployment.md`](docs/deployment.md).
3. Confirm `NEXT_PUBLIC_GL_CONTRACT_ADDRESS` (reference deployment is
   pre-filled in `.env.example`).
4. **Deploy** — no database is required. Without `DATABASE_URL` the
   interface runs on its zero-config in-memory store (markets reset on
   restart, flagged in the footer). Set `DATABASE_URL` only for durable
   storage (Supabase: *Session pooler* string + `?sslmode=require`).
5. One-time schema push, **only when using PostgreSQL**:

```bash
npx drizzle-kit push --force --url "postgres://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

Verify with `https://<your-app>/api/health` → `{"ok":true,"storage":…}`, then
create the first market from the interface. Full details in
[`docs/deployment.md`](docs/deployment.md).

## Contract Verification

The contract is the reference sample structure of its design — renamed for
Verdict (class, metadata, supported pairs) — and is verified with the
official GenVM toolchain (genvm-linter 0.10.0, runner v0.6.0-rc2, pyright,
Python 3.12):

| Check                            | Result                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `genvm-lint check`               | ok — 0 warnings · 31 methods (26 view / 5 write) · 0 ctor args |
| `genvm-lint typecheck`           | ok — 0 diagnostics                                            |
| `genvm-lint schema`              | ok — ABI extracted · `take_position` payable: true            |

Key design elements kept from the proven sample: `gl.vm.run_nondet_unsafe`
leader/validator consensus with exact field matching, float-free
`parse_int=str / parse_float=str` fixed-point parsing, error taxonomy via
`gl.vm.UserError`, strict ISO time from `gl.message_raw["datetime"]`, and
`paid_out` pool invariants. Deploy your own instance from GenLayer Studio by
pasting the file complete (starting with the `Depends` header) — checklist in
[`docs/contract.md`](docs/contract.md).

## Tests

```bash
npx tsx --test tests/*.test.ts
```

- `tests/evidence.test.ts` — pure candle selection/validation and the full
  INCONCLUSIVE truth table.
- `tests/quotes.test.ts` — every exchange adapter's quote and candle parsing.
- `tests/engine.test.ts` — full lifecycle integration against PostgreSQL:
  creation rules, position caps, side-locking, settlement, refund/payout
  math, single-claim guarantees.

Contract-side verification (GenVM) is documented in
[`docs/testing.md`](docs/testing.md).

## Documentation

| File                                        | Contents                                            |
| ------------------------------------------- | --------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md) | Reference architecture and data-integrity rules      |
| [`docs/contract.md`](docs/contract.md)      | Contract API, Studio checklist, verification results |
| [`docs/deployment.md`](docs/deployment.md)  | GitHub, Vercel, database setup                       |
| [`docs/testing.md`](docs/testing.md)        | Test guides (app + GenLayer tooling)                 |

---

Testnet only. Nothing on this site is financial advice.
