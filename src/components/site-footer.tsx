import { ExternalLink, ShieldCheck } from "lucide-react";
import { NETWORK } from "@/lib/constants";
import { shortAddr } from "@/lib/format";
import { storageMode } from "@/lib/store";

export function SiteFooter() {
  const ephemeral = storageMode() === "memory";
  return (
    <footer className="relative z-10 mt-24 border-t border-line-soft/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="text-sm font-bold tracking-[0.24em] text-paper">VERDICT</div>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-fade">
            Permissionless daily UP/DOWN prediction markets, settled by a GenLayer Intelligent
            Contract through validator consensus over real Binance and Bitget UTC candle evidence.
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-faint">
            <ShieldCheck className="h-3.5 w-3.5 text-up" />
            Testnet only. Nothing shown here is fabricated — unavailable data is stated plainly.
          </div>
          {ephemeral && (
            <div className="mt-2 text-[11px] leading-relaxed text-faint">
              Zero-config mode: markets are tracked in process memory and reset on restart. Set
              DATABASE_URL for durable storage — the on-chain contract is always the permanent
              record.
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-faint uppercase">Network</div>
          <ul className="mt-3 space-y-2 text-[13px] text-fade">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-up" />
              {NETWORK.name}
            </li>
            {NETWORK.contract && (
              <li className="text-xs">
                Verdict contract:{" "}
                <a
                  className="text-glow hover:underline"
                  href={`${NETWORK.explorer}/address/${NETWORK.contract}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(NETWORK.contract, 10, 8)}
                </a>
              </li>
            )}
            <li className="text-xs leading-relaxed">
              Open source — see the repository docs to deploy your own instance and contract.
            </li>
          </ul>
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-faint uppercase">Builders</div>
          <ul className="mt-3 space-y-2 text-[13px]">
            {[
              { label: "GenLayer Docs", href: NETWORK.docs },
              { label: "GenLayer Studio", href: NETWORK.studio },
              { label: "Bradbury Explorer", href: NETWORK.explorer },
              { label: "Builder Resources", href: NETWORK.portal },
            ].map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1.5 text-fade transition-colors hover:text-paper"
                >
                  {l.label}
                  <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line-soft/60 py-5 text-center text-[10px] tracking-[0.3em] text-faint uppercase">
        Settled by consensus · Binance × Bitget UTC candle truth
      </div>
    </footer>
  );
}
