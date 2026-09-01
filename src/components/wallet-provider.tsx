"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NETWORK } from "@/lib/constants";
import { getEthereum, isUserRejection, weiHexToGen } from "@/lib/ethereum";

export type WalletState = {
  hasMetaMask: boolean;
  address: string | null;
  /** Connected EVM chain id (hex) reported by MetaMask. */
  chainId: string | null;
  /** Native GEN balance read on-chain via MetaMask (never stored server-side). */
  balanceGen: string | null;
  connecting: boolean;
  hydrated: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  /** True once NEXT_PUBLIC_GL_CHAIN_ID is configured and MetaMask matches it. */
  onExpectedChain: boolean;
  switchToBradbury: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balanceGen, setBalanceGen] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedChainId = NETWORK.chainId ? NETWORK.chainId.toLowerCase() : "";
  const onExpectedChain = !expectedChainId || (chainId?.toLowerCase() ?? "") === expectedChainId;

  const readBalance = useCallback(async (addr: string) => {
    const eth = getEthereum();
    if (!eth) return;
    try {
      const bal = await eth.request({ method: "eth_getBalance", params: [addr, "latest"] });
      setBalanceGen(weiHexToGen(String(bal)));
    } catch {
      setBalanceGen(null);
    }
  }, []);

  const syncAccounts = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    const [accounts, chain] = (await Promise.all([
      eth.request({ method: "eth_accounts" }) as Promise<string[]>,
      eth.request({ method: "eth_chainId" }) as Promise<string>,
    ])) as [string[], string];
    const addr = accounts?.[0] ?? null;
    setAddress(addr);
    setChainId(chain ?? null);
    if (addr) void readBalance(addr);
    else setBalanceGen(null);
  }, [readBalance]);

  useEffect(() => {
    const eth = getEthereum();
    setHasMetaMask(!!eth);
    if (!eth) {
      setHydrated(true);
      return;
    }
    void syncAccounts().finally(() => setHydrated(true));

    const onAccounts = (accs: unknown) => {
      const list = accs as string[];
      const addr = list?.[0] ?? null;
      setAddress(addr);
      if (addr) void readBalance(addr);
      else setBalanceGen(null);
    };
    const onChain = (id: unknown) => {
      setChainId(typeof id === "string" ? id : null);
      void syncAccounts();
    };
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [syncAccounts, readBalance]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setError("MetaMask was not detected in this browser.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await eth.request({ method: "eth_requestAccounts" });
      await syncAccounts();
    } catch (err) {
      setError(isUserRejection(err) ? "Connection request was rejected in MetaMask." : "MetaMask connection failed.");
    } finally {
      setConnecting(false);
    }
  }, [syncAccounts]);

  const disconnect = useCallback(() => {
    // MetaMask connections are revoked from the extension; clear local view state.
    setAddress(null);
    setBalanceGen(null);
  }, []);

  const refresh = useCallback(async () => {
    await syncAccounts();
  }, [syncAccounts]);

  const switchToBradbury = useCallback(async () => {
    const eth = getEthereum();
    if (!eth || !expectedChainId) return;
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainId }] });
    } catch (err) {
      const code = (err as { code?: number } | null)?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: expectedChainId,
              chainName: NETWORK.name,
              nativeCurrency: { name: "GEN", symbol: NETWORK.currencySymbol, decimals: 18 },
              rpcUrls: [NETWORK.rpc],
              blockExplorerUrls: [NETWORK.explorer],
            },
          ],
        });
      } else if (isUserRejection(err)) {
        setError("Network switch was rejected in MetaMask.");
      } else {
        setError("Could not switch networks in MetaMask.");
      }
    }
    await syncAccounts();
  }, [expectedChainId, syncAccounts]);

  const value = useMemo(
    () => ({
      hasMetaMask,
      address,
      chainId,
      balanceGen,
      connecting,
      hydrated,
      error,
      connect,
      disconnect,
      refresh,
      onExpectedChain,
      switchToBradbury,
    }),
    [
      hasMetaMask,
      address,
      chainId,
      balanceGen,
      connecting,
      hydrated,
      error,
      connect,
      disconnect,
      refresh,
      onExpectedChain,
      switchToBradbury,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
