import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { BackgroundFX } from "@/components/background-fx";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WalletProvider } from "@/components/wallet-provider";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sg" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbm" });

export const metadata: Metadata = {
  title: "VERDICT — Daily Candle Markets Settled by GenLayer Consensus",
  description:
    "Permissionless daily UP/DOWN prediction markets settled by a GenLayer Intelligent Contract through two-source validator consensus over Binance and Bitget UTC candle evidence on the Bradbury testnet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-ink-950 font-sans text-paper antialiased">
        <WalletProvider>
          <BackgroundFX />
          <SiteHeader />
          <main className="relative z-10">{children}</main>
          <SiteFooter />
        </WalletProvider>
      </body>
    </html>
  );
}
