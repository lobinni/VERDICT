# Verdict Intelligent Contract — API & Studio Deployment

Source: `contracts/Verdict.py` (GenVM Python, py-genlayer). The implementation
mirrors the reference production sample contract for this design, renamed for
Verdict (class, product metadata, supported pairs). Its proven elements are
kept intact:

- **Consensus**: `gl.vm.run_nondet_unsafe(fetch, verify)` — the leader runs a
  nested `fetch()` over both locked venues; every validator re-runs the same
  fetch inside `verify(...)` and the leader's record is accepted only when
  all consensus-critical fields match exactly (`_same_result`).
- **Deterministic evidence parsing**: `json.loads(..., parse_int=str,
  parse_float=str)` plus string-based fixed-point price/timestamp parsers —
  no floats anywhere, so validators parse byte-identically.
- **Error taxonomy**: `gl.vm.UserError` with `[EXPECTED] / [EXTERNAL] /
  [TRANSIENT]` prefixes; fetch failures classify into `MISSING`,
  `UNAVAILABLE`, `MALFORMED`, `WRONG_TIMESTAMP`, `INCOMPLETE`, `EQUAL`.
- **Time model**: strict ISO validation of `gl.message_raw["datetime"]`,
  civil-date math, candle windows stored as epoch seconds (`opens_at`,
  `settles_at`).
- **Accounting**: pool totals, per-side totals, `paid_out` invariant checks,
  mark-before-pay claims, O(1) duplicate guard via `market_keys`, and a
  per-wallet market index for bounded pagination.

It is self-contained and deployable as-is from **GenLayer Studio** on the
Bradbury testnet.

## Design invariants (verified in review)

1. **Storage uses only GenVM-safe declarations**: `TreeMap[u256, Market]`,
   `TreeMap[u256, Position]`, `u256` counters, and `@allow_storage @dataclass`
   records. No raw `int`/`dict`/`list` storage annotations (GenVM requires
   `u256`/`TreeMap`/`DynArray`). Zero-initialization gives
   `market_count = 0` — `__init__` is intentionally empty.
2. **Payable value handling**: `take_position` is `@gl.public.write.payable`
   and reads the stake from `gl.message.value`. Payouts use
   `gl.get_contract_at(recipient).emit_transfer(amount)` (ghost-contract
   native transfer) guarded by `self.balance >= amount`.
3. **Deterministic time only**: all timing comparisons use
   `gl.message_raw["datetime"]` (protocol transaction time) truncated to the
   canonical UTC date. No caller-supplied time is trusted.
4. **Nondeterministic boundary**: exchange reads run inside
   `gl.eq_principle.strict_eq(...)`, returning a compact, sorted-key JSON
   record. Validators refetch both sources and must reproduce the exact
   record — only then does evidence become settlement state.
5. **Bounded, validated evidence**: response bodies are truncated (60 KB);
   the exact target candle is selected by timestamp; wrong-timestamp,
   missing, or malformed rows are rejected into an explicit error record.
6. **No single-source fallback**: UP needs both venues up; DOWN needs both
   down; everything else (failures included) is INCONCLUSIVE → refund-all.
7. **Atomic claims**: positions are marked claimed before the transfer; a
   claim can succeed exactly once, by the owner only.

## Method surface — 5 writes, 26 reads

### Writes

| Method | Behavior |
| --- | --- |
| `open_market(symbol, market_date) -> int` | Creates an OPEN market for a supported pair and a strictly future canonical UTC date (≤ 366 days ahead). Rejects duplicates and bad dates. Returns the new market id. |
| `take_position(market_id, side)` payable | Stake = `gl.message.value`. Min 1 GEN, cumulative max 10 GEN per wallet per market, same-side top-ups allowed, side switching rejected, updates pools. |
| `close_entries(market_id)` | Locks an OPEN market once the target date has begun (and before it completes). Permissionless. |
| `resolve_market(market_id) -> str` | After the candle completes, runs two-source validator-verified consensus and stores the verdict, a structured `SettlementEvidence` record, and the refund flag. Returns the resolution. Permissionless; no caller influence. |
| `claim(market_id) -> u256` | Pays proportional winnings, or the full stake on the refund path, via native transfer with pool/`paid_out` invariant checks. Sender-bound, once-only. Returns the paid amount. |

### Reads

- **Market**: `get_market`, `get_market_summary`, `get_market_status`,
  `get_market_timing`, `get_current_market`, `get_market_pools`,
  `get_market_count`.
- **User & positions**: `get_user_market`, `get_position`, `get_user_stake`,
  `get_remaining_position_capacity`, `get_user_positions`.
- **Claims & settlement**: `get_claimable`, `is_claimable`, `has_claimed`,
  `get_claim_estimate`, `get_refund_eligibility`, `get_resolved_outcome`,
  `get_settlement_evidence`.
- **Discovery (paginated, max 50/page)**: `get_markets`, `get_open_markets`,
  `get_ready_to_settle_markets`, `get_user_market_ids`,
  `get_claimable_markets`.
- **Configuration**: `get_supported_symbols`, `get_config`.

`get_market_status` maps to the product phases: `PREDICTION_OPEN`,
`CANDLE_IN_PROGRESS`, `READY_TO_RESOLVE`, `SETTLED`, `REFUND`.

## Reference deployment (live on Bradbury)

- Contract address: `0x5056ad2dFf0a132c42806c2efaEb206743186E0b`
- Explorer: https://explorer-bradbury.genlayer.com/address/0x5056ad2dFf0a132c42806c2efaEb206743186E0b

This exact source (`contracts/Verdict.py`) is deployed and callable on the
Bradbury testnet. Deploying your own instance follows the same checklist
below — paste the file complete, starting with the `Depends` header line.

## Deploy from GenLayer Studio (checklist)

1. Open https://studio.genlayer.com and connect your MetaMask wallet.
2. Fund the account with test GEN from the official faucet.
3. Create a new project and paste `contracts/Verdict.py` unchanged.
4. Select the **Bradbury** network and deploy (no constructor arguments).
5. Copy the deployed contract address.
6. Point the app at it: set `NEXT_PUBLIC_GL_CONTRACT_ADDRESS` (and
   `NEXT_PUBLIC_GL_CHAIN_ID` per the official network configuration), then
   restart the interface.
7. Smoke-test on Studio: call `get_config` and `get_supported_symbols`
   (read), then `open_market` with a future date (write) and confirm it
   appears via `get_market_count` / `get_market`.

## Interface notes (genlayer-js, production write path)

- Create the client with the connected MetaMask address as the account —
  MetaMask performs signing (`createClient({ chain: bradbury, account:
  "0x…" })`).
- Pass the stake as transaction value for `take_position`.
- Wait for `TransactionStatus.ACCEPTED` before reading back state for writes.

## Verification performed here (official toolchain)

Executed against `genvm-linter` 0.10.0 with the universal GenVM runner
(v0.6.0-rc2) and pyright, on Python 3.12:

```bash
genvm-lint check contracts/Verdict.py --json
#  => ok: true · lint 3 passed, 0 warnings · validate ok
#     contract "Verdict" · 31 methods (26 view, 5 write) · 0 ctor params

genvm-lint schema contracts/Verdict.py --json
#  => ok: true · full ABI extracted · take_position payable: true

genvm-lint typecheck contracts/Verdict.py --json
#  => ok: true · 0 diagnostics (0 errors, 0 warnings, 0 info)
```

| Check | Result |
| --- | --- |
| GenVM lint + semantic validation (`check`) | Passed — 0 lint warnings, 31 methods, 5 writes / 26 views, no ctor params |
| ABI schema extraction (`schema`) | Passed — `take_position` correctly marked `payable` |
| Strict SDK typecheck (`typecheck`) | Passed — 0 diagnostics |
| Python syntax (`py_compile`) | Passed |
| Sample-structure conformance | Imports order, dataclass records, nested nondet + strict_eq, `gl.vm.UserError` rejections |
| Payable + native payout API | `gl.message.value` receive, `emit_transfer(value=…)` payout |
| Deterministic time source | `gl.message_raw["datetime"]` only |
| Positions & payout math | Covered by `tests/engine.test.ts` lifecycle suite |

The only remaining notice is I200, an informational hint that a newer runner
exists upstream — it does not affect deployment.

For behavioral tests against a simulator or testnet, use
`gltest --chain-type studionet` (genlayer-test).

## Troubleshooting: "Could not load contract schema" in Studio

If Studio's run-debug page reports **Could not load contract schema**, check
these causes — all verified against the official toolchain:

1. **Missing dependency header.** The very first line of the file must be the
   py-genlayer dependency comment (`# { "Depends": "py-genlayer:…" }`). If it
   is lost when copy-pasting, Studio cannot select an SDK and schema loading
   fails. Paste the file complete, starting at that line.
2. **SDK-strict API usage (found and fixed in this contract):**
   - `gl.nondet.web.Response.body` is `bytes | None` — it must be checked
     before calling `.decode(...)`. The contract now guards both the HTTP
     status and an empty body before parsing.
   - Native payouts use the keyword-only SDK signature
     `get_contract_at(addr).emit_transfer(value=amount)` — a positional
     argument is rejected by the SDK typecheck.
3. **One contract per file.** GenVM allows exactly one `gl.Contract`
   subclass per module; helper classes (`@allow_storage dataclass` records)
   are fine.
4. **Re-run the local trio** above after any edit — all three must report
   `ok: true` before Studio will accept the contract.
