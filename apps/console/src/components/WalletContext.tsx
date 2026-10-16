import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ATLANTIC, weiToPhrs } from "../types";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

export type WalletState =
  | { status: "idle" }
  | { status: "no-wallet" }
  | { status: "connecting" }
  | { status: "wrong-network"; address: string; balance: string | null }
  | { status: "connected"; address: string; balance: string | null; networkOk: boolean }
  | { status: "error"; message: string };

interface WalletCtx {
  state: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const Ctx = createContext<WalletCtx>({
  state: { status: "idle" },
  connect: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useWallet = () => useContext(Ctx);

async function readBalance(address: string): Promise<string | null> {
  try {
    const bal = await window.ethereum.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
    return typeof bal === "string" ? weiToPhrs(bal) : null;
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;

  const disconnect = useCallback(() => setState({ status: "idle" }), []);

  const ensureAtlantic = useCallback(async (): Promise<boolean> => {
    const eth = window.ethereum;
    const chainId = (await eth.request({ method: "eth_chainId" })) as string;
    if (chainId?.toLowerCase() === ATLANTIC.chainIdHex.toLowerCase()) return true;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ATLANTIC.chainIdHex }],
      });
      return true;
    } catch (switchErr: unknown) {
      const code = (switchErr as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: ATLANTIC.chainIdHex,
                chainName: ATLANTIC.name,
                rpcUrls: [ATLANTIC.rpcUrl],
                blockExplorerUrls: [ATLANTIC.explorer],
                nativeCurrency: ATLANTIC.currency,
              },
            ],
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    const s = stateRef.current;
    if (s.status !== "connected" && s.status !== "wrong-network") return;
    const bal = await readBalance(s.address);
    setState((prev) =>
      prev.status === "connected" || prev.status === "wrong-network"
        ? { ...prev, balance: bal }
        : prev
    );
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState({ status: "no-wallet" });
      return;
    }
    setState({ status: "connecting" });
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts || accounts.length === 0) {
        setState({ status: "error", message: "No accounts were shared by the wallet." });
        return;
      }
      const address = accounts[0];
      const ok = await ensureAtlantic();
      const balance = await readBalance(address);
      if (ok) setState({ status: "connected", address, balance, networkOk: true });
      else setState({ status: "wrong-network", address, balance });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wallet connection was rejected.";
      setState({ status: "error", message: msg });
    }
  }, [ensureAtlantic]);

  // Keep state honest when the user changes accounts or networks in the wallet.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    const onAccounts = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setState({ status: "idle" });
      } else {
        void connect();
      }
    };
    const onChain = () => {
      const s = stateRef.current;
      if (s.status === "connected" || s.status === "wrong-network") connect();
    };
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [connect]);

  return (
    <Ctx.Provider value={{ state, connect, disconnect, refreshBalance }}>
      {children}
    </Ctx.Provider>
  );
}
