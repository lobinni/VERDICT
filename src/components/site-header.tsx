"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Loader2, LogOut, TriangleAlert, Wallet } from "lucide-react";
import { NETWORK } from "@/lib/constants";
import { shortAddr } from "@/lib/format";
import { UtcClock } from "./utc-clock";
import { useWallet } from "./wallet-provider";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/activity", label: "Activity" },
  { href: "/create", label: "Create" },
  { href: "/how-it-works", label: "How It Works" },
];

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <path
        d="M13 2 L22 7.5 V18.5 L13 24 L4 18.5 V7.5 Z"
        className="stroke-glow"
        strokeWidth="1.6"
        fill="none"
      />
      <path d="M8.5 9 L13 17.5 L17.5 9" className="stroke-up" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const {
    hasMetaMask,
    address,
    balanceGen,
    connecting,
    hydrated,
    onExpectedChain,
    connect,
    disconnect,
    switchToBradbury,
  } = useWallet();

  const chainConfigured = NETWORK.chainId !== "";

  return (
    <header className="sticky top-0 z-40 border-b border-line-soft/80 bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <LogoMark />
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-[0.24em] text-paper">VERDICT</span>
            <span className="mt-1 block text-[9px] font-medium tracking-[0.2em] text-faint uppercase">
              GenLayer consensus markets
            </span>
          </span>
        </Link>

        <nav className="mx-auto flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? "text-paper" : "text-fade hover:text-paper"
                }`}
              >
                {active && <span className="absolute inset-0 rounded-full border border-glow/30 bg-glow/10" />}
                <span className="relative">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          <UtcClock />

          {!hydrated ? (
            <span className="h-9 w-[132px] animate-pulse rounded-full bg-ink-800" />
          ) : !hasMetaMask ? (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full border border-glow/40 bg-glow/10 px-4 py-2 text-[13px] font-semibold text-glow transition-colors hover:bg-glow/20"
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Install MetaMask</span>
              <ExternalLink className="hidden h-3 w-3 sm:inline" />
            </a>
          ) : address ? (
            <span className="flex items-center gap-1.5">
              {chainConfigured && !onExpectedChain && (
                <button
                  onClick={() => void switchToBradbury()}
                  className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/20"
                >
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Switch to {NETWORK.shortName}
                </button>
              )}
              <span className="flex items-center gap-1 rounded-full border border-line bg-ink-900/80 py-1 pr-1 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                <span className="font-mono text-xs font-semibold text-paper tabular">
                  {balanceGen ?? "…"}
                  <span className="ml-1 text-[10px] font-normal text-faint">{NETWORK.currencySymbol}</span>
                </span>
                <span className="mx-1.5 hidden font-mono text-[11px] text-fade sm:inline">{shortAddr(address)}</span>
                <button
                  onClick={disconnect}
                  title="Hide wallet (revoke access from MetaMask)"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-down/15 hover:text-down"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </span>
            </span>
          ) : (
            <button
              onClick={() => void connect()}
              disabled={connecting}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-glow-deep to-glow px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_30px_-10px_rgba(139,124,255,0.8)] transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              <span className="hidden sm:inline">{connecting ? "Connecting" : "Connect MetaMask"}</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
