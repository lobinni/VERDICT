# Testing Guide

Two test layers ship with this repository: the **application suites**
(TypeScript, runnable here) and the **GenLayer-side verification** (run in a
Python environment with the GenLayer tooling installed).

## 1. Application suites (this repo)

Requirements: the same PostgreSQL instance used by the app
(`DATABASE_URL`, default `postgresql://postgres:postgres@127.0.0.1:5432/app_db`).

```bash
npx tsx --test tests/*.test.ts
```

What runs:

- `tests/evidence.test.ts` — pure unit tests over the settlement logic:
  exact target-candle selection for both venues, rejection of missing rows,
  malformed prices, and the full INCONCLUSIVE truth table. Fixtures are
  inline exchange payloads used solely as test inputs — never as app data.
- `tests/engine.test.ts` — integration tests against PostgreSQL covering the
  whole lifecycle: market creation rules (future dates, canonical format,
  duplicates, forward bound), position rules (minimum stake, cumulative cap,
  no side switching, sender binding), settlement (consensus resolves the
  market and writes evidence), refund/directional claim math, and the
  single-claim guarantee. The suite creates and cleans up its own fixtures.

Both suites must pass before any deploy:

```bash
# expected tail
# pass 24
# fail 0
```

## 2. GenLayer-side verification (contract)

Requires Python 3.12+ and the official GenVM linter
(`pip install "genvm-linter @ git+https://github.com/genlayerlabs/genvm-linter@main"`).

```bash
genvm-lint check contracts/Verdict.py --json      # semantic validation
genvm-lint schema contracts/Verdict.py --json     # ABI extraction (must show 31 methods)
genvm-lint typecheck contracts/Verdict.py --json  # strict SDK typecheck
```

Current results on this machine (genvm-linter 0.10.0, runner v0.6.0-rc2,
pyright, Python 3.12.14): **check ok — lint 3 passed with 0 warnings,
validate ok — 31 methods (26 view / 5 write, 0 ctor params); schema ok —
take_position payable: true, resolve_market -> string, claim -> int;
typecheck ok — 0 diagnostics.**

Behavioral tests against the simulator or a testnet run through
genlayer-test:

```bash
gltest --chain-type studionet
```

## 3. Manual smoke test (deployed on Bradbury)

1. `get_config` — returns limits and the two locked sources.
2. `open_market` with a future date — `get_market_count` increments.
3. `take_position` with 1 GEN (payable) — `get_market_pools` reflects it.
4. After the target candle completes, `resolve_market` —
   `get_settlement_evidence` returns the consensus record.
5. `claim` — the winner (or any position on the refund path) receives GEN;
   a second claim is rejected.
