import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Coins,
  ExternalLink,
  FileCode2,
  Fingerprint,
  Gavel,
  Globe2,
  Layers,
  Rocket,
  Scale,
  ShieldCheck,
  TerminalSquare,
  Vote,
  Wallet,
  Wrench,
} from "lucide-react";
import { NETWORK, VALIDATOR_COUNT } from "@/lib/constants";

export const dynamic = "force-dynamic";

const TRUTH_ROWS: { b: string; g: string; r: string; tone: "up" | "down" | "none" }[] = [
  { b: "higher close", g: "higher close", r: "UP", tone: "up" },
  { b: "lower close", g: "lower close", r: "DOWN", tone: "down" },
  { b: "higher close", g: "lower close or no signal", r: "INCONCLUSIVE", tone: "none" },
  { b: "lower close", g: "higher close or no signal", r: "INCONCLUSIVE", tone: "none" },
  { b: "no signal", g: "anything", r: "INCONCLUSIVE", tone: "none" },
];

const ACTIONS: { title: string; desc: string }[] = [
  {
    title: "Open a market",
    desc: "Anyone may create a market for a supported pair and a future UTC date, subject to duplicate checks and a 366-day forward limit.",
  },
  {
    title: "Take a position",
    desc: "Stake between 1 and 10 GEN on UP or DOWN while entries are open. The stake is the transaction value itself — no hidden accounting. Switching sides is rejected; same-side top-ups are allowed.",
  },
  {
    title: "Close entries",
    desc: "Once the target UTC candle begins, entries stop automatically. Anyone may also lock the market explicitly at the cutoff.",
  },
  {
    title: "Request settlement",
    desc: "After the candle completes, anyone may ask for settlement. The requester supplies only the market id and has zero influence over the outcome.",
  },
  {
    title: "Claim",
    desc: "Winners split the full pool in proportion to their stake; inconclusive outcomes refund every stake in full. Each position can be claimed exactly once, by its owner only.",
  },
];

const RESOURCES = [
  { Icon: BookOpen, title: "Documentation", desc: "Intelligent Contracts, GenVM, Optimistic Democracy, Equivalence Principle.", href: NETWORK.docs },
  { Icon: Wrench, title: "GenLayer Studio", desc: "Browser IDE to write, simulate and deploy contracts to Bradbury.", href: NETWORK.studio },
  { Icon: Globe2, title: "Bradbury Explorer", desc: "Inspect transactions, validator consensus rounds and appeals.", href: NETWORK.explorer },
  { Icon: Coins, title: "Testnet Faucet", desc: "Claim test GEN to deploy and interact on Bradbury.", href: NETWORK.faucet },
  { Icon: TerminalSquare, title: "genlayer-js SDK", desc: "TypeScript client for reads, writes and transaction tracking.", href: "https://www.npmjs.com/package/genlayer-js" },
  { Icon: Rocket, title: "Builder Resources", desc: "Foundation portal: hackathons, Builder Points and quests.", href: NETWORK.portal },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 pb-4 sm:px-6">
      {/* heading */}
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-glow/30 bg-glow/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.22em] text-glow uppercase">
          <Scale className="h-3.5 w-3.5" />
          Settlement is a verdict, not an oracle
        </div>
        <h1 className="mt-5 text-4xl leading-tight font-bold text-paper sm:text-5xl">
          How the <span className="text-iridescent">GenLayer court</span> settles a price
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fade">
          Verdict is an Intelligent Contract on GenLayer. Everything deterministic — market timing,
          pools, caps, claims — stays in plain contract code. Everything nondeterministic — reading
          two exchange feeds — happens inside the validator consensus boundary, where a leader
          proposes evidence and {VALIDATOR_COUNT} validators independently refetch and vote.
        </p>
      </div>

      {/* pipeline */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-paper">The settlement pipeline</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            { Icon: Wallet, title: "1 · Predict", body: "Connect MetaMask and stake 1–10 GEN on UP or DOWN before the target UTC candle begins. Positions are sender-bound and capped." },
            { Icon: Gavel, title: "2 · Candle runs", body: "Entries close at UTC midnight. Timing comes from the protocol's deterministic transaction time — never from a frontend clock." },
            { Icon: Globe2, title: "3 · Evidence", body: "Anyone requests settlement. Inside the nondeterministic boundary, the leader fetches the Binance and Bitget daily candles and normalizes a compact record." },
            { Icon: Vote, title: "4 · Consensus", body: "Validators independently refetch both sources and apply the Equivalence Principle to the normalized record. Only exactly matching evidence is stored." },
            { Icon: Coins, title: "5 · Verdict", body: "UP, DOWN, or INCONCLUSIVE. Winners claim proportional pool payouts; inconclusive or empty winning sides refund every stake." },
          ].map((s, i) => (
            <div key={s.title} className="glass glass-hover relative rounded-2xl p-4">
              <s.Icon className="h-5 w-5 text-glow" />
              <div className="mt-3 text-[13px] font-bold text-paper">{s.title}</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-fade">{s.body}</p>
              {i < 4 && (
                <ArrowRight className="absolute top-1/2 -right-2.5 hidden h-4 w-4 -translate-y-1/2 text-glow/50 md:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* equivalence */}
      <section className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-xl font-bold text-paper">The Equivalence Principle</h2>
          <p className="mt-3 text-sm leading-relaxed text-fade">
            Web reads are nondeterministic: two validators may see slightly different bytes. GenLayer
            resolves this with the Equivalence Principle — the contract defines what
            &quot;equivalent&quot; means, and validators accept only leader output that matches it.
            Verdict uses strict equality over a normalized record: the pair, the market date, the
            exact expected candle window, fixed-point open and close prices, each source&apos;s
            status, each source&apos;s direction, and the proposed verdict.
          </p>
          <div className="mt-5 space-y-2.5">
            {[
              { Icon: Fingerprint, t: "One canonical candle", d: "Each source must contribute the exact target UTC daily candle — stale, future, mistimed, or malformed rows are rejected." },
              { Icon: ShieldCheck, t: "No single-source fallback", d: "If either source fails or disagrees, the only valid verdict is INCONCLUSIVE — and all stakes refund." },
              { Icon: Bot, t: "The requester has zero influence", d: "A settlement request carries nothing but a market id. Nobody can inject or override evidence." },
            ].map((f) => (
              <div key={f.t} className="flex gap-3 rounded-xl border border-line-soft bg-ink-900/50 px-4 py-3">
                <f.Icon className="mt-0.5 h-4 w-4 shrink-0 text-up" />
                <div>
                  <div className="text-[13px] font-semibold text-paper">{f.t}</div>
                  <div className="text-[11px] leading-relaxed text-fade">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-[0.2em] text-fade uppercase">The truth table</span>
            <Layers className="h-4 w-4 text-glow" />
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line-soft text-[10px] tracking-[0.18em] text-faint uppercase">
                <th className="py-2 pr-3 font-medium">Binance candle</th>
                <th className="py-2 pr-3 font-medium">Bitget candle</th>
                <th className="py-2 text-right font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {TRUTH_ROWS.map((r, i) => (
                <tr key={i} className="border-b border-line-soft/50 last:border-0">
                  <td className="py-2.5 pr-3 text-fade">{r.b}</td>
                  <td className="py-2.5 pr-3 text-fade">{r.g}</td>
                  <td
                    className={`py-2.5 text-right font-bold ${
                      r.tone === "up" ? "text-up" : r.tone === "down" ? "text-down" : "text-gold"
                    }`}
                  >
                    {r.r}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 rounded-xl border border-line-soft bg-ink-950/60 p-3.5 text-[11px] leading-relaxed text-fade">
            Equal open and close values, source outages, and missing candles all resolve to
            inconclusive. When a directional verdict has no stake on its winning side, the market
            keeps its recorded verdict but every position follows the refund path.
          </p>
        </div>
      </section>

      {/* actions */}
      <section className="mt-14">
        <h2 className="text-xl font-bold text-paper">What you can do</h2>
        <p className="mt-2 text-sm text-fade">
          Every rule below is enforced before anything is stored; rejected actions change nothing.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ACTIONS.map((a, i) => (
            <div key={a.title} className="glass glass-hover rounded-2xl p-4">
              <div className="text-[13px] font-bold text-paper">
                <span className="mr-2 font-mono text-[11px] text-glow">{String(i + 1).padStart(2, "0")}</span>
                {a.title}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-fade">{a.desc}</p>
            </div>
          ))}
          <div className="flex flex-col justify-center rounded-2xl border border-line-soft bg-ink-900/40 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-paper">
              <FileCode2 className="h-4 w-4 text-glow" />
              The contract source
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-fade">
              The Intelligent Contract lives in contracts/Verdict.py at the repository root, with a
              full method reference and Studio deployment checklist in docs/contract.md.
            </p>
          </div>
        </div>
      </section>

      {/* resources */}
      <section className="mt-14">
        <h2 className="text-xl font-bold text-paper">Builder resources</h2>
        <p className="mt-2 text-sm text-fade">Everything needed to ship on GenLayer Bradbury.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((r) => (
            <a
              key={r.title}
              href={r.href}
              target="_blank"
              rel="noreferrer"
              className="glass glass-hover group rounded-2xl p-5"
            >
              <div className="flex items-center justify-between">
                <r.Icon className="h-5 w-5 text-glow" />
                <ExternalLink className="h-3.5 w-3.5 text-faint transition-colors group-hover:text-glow" />
              </div>
              <div className="mt-3 text-[14px] font-bold text-paper">{r.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-fade">{r.desc}</p>
            </a>
          ))}
        </div>
      </section>

      <div className="mt-14 rounded-3xl border border-glow/25 bg-gradient-to-br from-glow/10 via-ink-900/60 to-ink-950 px-6 py-10 text-center">
        <h2 className="text-2xl font-bold text-paper">
          Ready to let the <span className="text-iridescent">validators</span> judge?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-fade">
          Connect MetaMask, take a side, and watch two exchanges agree — or disagree — under
          consensus.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-glow-deep to-glow px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(139,124,255,0.9)] transition-transform hover:scale-[1.03] active:scale-95"
        >
          Open markets <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
