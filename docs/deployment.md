# Deployment Guide — GitHub + Vercel

This project deploys cleanly to Vercel **with zero configuration**. The
intelligent contract holds the canonical state on-chain — no database is
required: without `DATABASE_URL` the interface runs on a zero-config
in-memory store (markets reset on restart, clearly flagged in the footer).
Set `DATABASE_URL` only when you want durable storage for the interface's
indexer mirror.

## 1. Push to GitHub

```bash
git init
git add -A
git commit -m "Verdict — daily candle markets settled by GenLayer consensus"
git branch -M main
git remote add origin https://github.com/<your-username>/verdict.git
git push -u origin main
```

Notes:

- `.gitignore` already excludes `node_modules`, `.next`, and `.env` — real
  secrets never leave your machine. `.env.example` is committed as the
  reference template.
- Create the empty repository on github.com first (no README — the push above
  populates it).

## 2. (Optional) Provision PostgreSQL for durable storage

**Skip this step entirely if you are fine with the zero-config in-memory
mode** — the interface deploys and works without any database. Set up
PostgreSQL only when you want markets and positions to persist across
restarts.

Any PostgreSQL works. The quickest path on Vercel:

1. Project → **Storage** → **Create Database** → **Postgres** (Neon).
2. Connect it to the project — Vercel injects `DATABASE_URL` and
   `POSTGRES_URL` automatically.

### Using Supabase

Supabase works well, but pick the right connection string — this is the
single most common cause of a deployment that "cannot load the page":

1. Supabase Dashboard → **Connect** → **Connection string**.
2. Choose **Session pooler** (recommended for serverless). It looks like
   `postgresql://postgres.PROJECT-REF:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres`.
3. **Append `?sslmode=require` to the string** — Supabase requires an
   encrypted connection.
4. Do **not** use the "Direct connection" host (`db.PROJECT-REF.supabase.co`)
   from serverless: it resolves to IPv6 only and is frequently unreachable,
   which makes pages fail at request time.
5. Paste the final string into Vercel without quotes or trailing spaces,
   save it for **Production** (and Preview if needed), and **trigger a fresh
   deployment** — environment changes only apply to new deployments.
6. Run the one-time schema push (step 5 below) with the same string.

Alternatives (Neon, Railway, self-hosted) work the same way: copy their
connection string into the environment variables below.

## 3. Configure environment variables (Vercel → Settings → Environment Variables)

| Variable | Value | When |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (auto-injected by Vercel Storage) | Optional — durable storage only |
| `NEXT_PUBLIC_GL_CONTRACT_ADDRESS` | Deployed contract — `0x5056ad2dFf0a132c42806c2efaEb206743186E0b` or your own | Interface links to the explorer |
| `NEXT_PUBLIC_GL_RPC_URL` | `https://rpc-bradbury.genlayer.com` | Default already set |
| `NEXT_PUBLIC_GL_EXPLORER_URL` | `https://explorer-bradbury.genlayer.com` | Default already set |
| `NEXT_PUBLIC_GL_CHAIN_ID` | Chain id from the official Bradbury network configuration | Enables MetaMask network switching |

Set them for **Production** (and Preview if you use preview deployments).

**Why there is no DATABASE_URL requirement:** the storage layer
(`src/lib/store.ts`) picks its backend from the environment — PostgreSQL when
`DATABASE_URL` is set, otherwise the built-in in-memory store. Both implement
the identical engine API, so create/stake/settle/claim work the same either
way. If `DATABASE_URL` is set but the database is unreachable, pages and API
still answer gracefully (`DATABASE_UNREACHABLE` + a fix checklist) instead of
crashing.

## 4. Deploy on Vercel

1. vercel.com → **Add New…** → **Project** → import the GitHub repository.
2. Framework preset: **Next.js** (detected automatically). Keep the default
   build command `npm run build` and output settings.
3. Add the environment variables from step 3.
4. **Deploy**.

## 5. Initialize the database schema (one time)

From your machine, point the schema push at the production database:

```bash
npx drizzle-kit push --force --url "postgres://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

(drizzle-kit accepts a connection-string override, so the local
`drizzle.config.json` stays untouched for development.)

Verify: open `https://<your-app>/api/health` — it returns `{"ok":true,
"storage":"postgres"}` when connected (or `"storage":"memory"` in zero-config
mode) — then create the first market from the interface (Create page) or
through the markets API.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Vercel says an update to DATABASE_URL is required | Variable unset or only set for one environment | Set it for **Production** (and Preview), then redeploy |
| Page fails to load after setting a Supabase string | Direct IPv6 host used, or missing TLS requirement | Switch to the **Session pooler** string and append `?sslmode=require`; redeploy |
| Pages show "Database unreachable" | Connection refused, DNS, timeout, or wrong password | Re-copy the exact string, check the project password, remove quotes/spaces, redeploy |
| API answers `DATABASE_UNREACHABLE` | Same as above — now reported explicitly instead of a crash | Same fix; verify with `/api/health` |
| Queries fail with "relation markets does not exist" | Schema never pushed | Run the one-time `drizzle-kit push` (step 5) against the same string |
| Everything works except writes | Read-only credentials or pooler misconfiguration | Use credentials of the `postgres` role and the Session pooler endpoint |

Quick verification after any fix: open `https://<your-app>/api/health` —
`{"ok":true}` means the database is connected; `{"ok":false,"database":
"not_configured"}` means DATABASE_URL is still missing;
`{"ok":false,"database":"unreachable"}` means the string is wrong or blocked.

## On-chain participation checklist (for your users)

Every write path (create, stake, lock, settle, claim) is a real contract
transaction on Bradbury:

1. Install MetaMask and unlock it.
2. Connect on the site — the first transaction asks to add the **GenLayer
   Bradbury** network (chain 4221); accept the switch.
3. Claim free test GEN from the official faucet — zero balance cannot pay
   network fees, and MetaMask will reject.
4. Sign in MetaMask; the transaction is executed by the validator set and the
   page shows its consensus stage until acceptance.

If creation fails, the page explains why: wrong network, missing GEN, or the
contract rule itself (duplicate market, past or malformed date, forward limit).

## 6. Production read-through

- Markets read instantly from the indexer; settlement requests run the
  two-source Binance × Bitget consensus live.
- Participation is MetaMask-only; point users to the official GenLayer faucet
  for test GEN.
- The canonical contract is the one shown in the footer; the explorer link
  leads to its Bradbury page.
