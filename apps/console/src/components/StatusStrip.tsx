import { CircleDot, Wallet } from "lucide-react";
import { useWallet } from "./WalletContext";
import { ATLANTIC, shortenAddress } from "../types";
import type { LampsData } from "../types";

/**
 * Status strip — connection state · network · wallet address · evidence timestamp.
 */
export default function StatusStrip({ data }: { data: LampsData }) {
  const { state, connect } = useWallet();
  const connected = state.status === "connected";
  const wrongNet = state.status === "wrong-network";

  const items: { label: string; value: React.ReactNode }[] = [
    {
      label: "Connection",
      value:
        connected ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-pass">
            <CircleDot size={12} /> Live
          </span>
        ) : wrongNet ? (
          <button onClick={connect} className="font-semibold text-fail underline underline-offset-2">
            Wrong network — click to fix
          </button>
        ) : state.status === "no-wallet" ? (
          <span className="text-slate">No wallet found — install one to connect</span>
        ) : (
          <button onClick={connect} className="inline-flex items-center gap-1.5 font-semibold text-accent">
            <Wallet size={12} /> Connect wallet
          </button>
        ),
    },
    { label: "Network", value: <span className="font-medium text-ink">{ATLANTIC.name} · {ATLANTIC.chainId}</span> },
    {
      label: "Wallet",
      value:
        connected || wrongNet ? (
          <span className="font-mono text-ink">{shortenAddress(state.address)}</span>
        ) : (
          <span className="text-slate">not connected</span>
        ),
    },
    {
      label: "Evidence",
      value: (
        <span className="font-mono text-slate">
          {new Date(data.generated_at).toLocaleString("en-GB", {
            timeZone: "Africa/Cairo",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="border-b border-hairline bg-porcelain">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-2 px-5 py-2.5 lg:px-10">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2 text-xs">
            <span className="font-bold uppercase tracking-[0.18em] text-slate">{it.label}</span>
            {it.value}
          </div>
        ))}
      </div>
    </div>
  );
}
