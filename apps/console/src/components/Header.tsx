import { useState } from "react";
import { Menu, Wallet, X } from "lucide-react";
import { useWallet } from "./WalletContext";
import { shortenAddress, ATLANTIC } from "../types";

function ConnectButton() {
  const { state, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (state.status === "connected") {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-tintdeep bg-porcelain px-4 py-2 transition-colors hover:border-accent"
          aria-label="Wallet menu"
        >
          <span className="flex h-2.5 w-2.5 rounded-full bg-pass" aria-hidden />
          <span className="font-mono text-sm font-semibold text-ink">
            {shortenAddress(state.address)}
          </span>
          <span className="tabular text-sm font-medium text-slate">
            {state.balance !== null ? `${state.balance} PHRS` : "…"}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-hairline bg-paper p-4 shadow-xl">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate">
              Connected
            </div>
            <div className="mb-3 break-all font-mono text-xs text-ink">{state.address}</div>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-slate">Balance</span>
              <span className="tabular font-semibold text-ink">
                {state.balance !== null ? `${state.balance} PHRS` : "—"}
              </span>
            </div>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="btn-outline w-full justify-center"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button onClick={connect} className="btn-primary" disabled={state.status === "connecting"}>
      <Wallet size={16} />
      {state.status === "connecting"
        ? "Connecting…"
        : state.status === "wrong-network"
          ? "Switch to Atlantic"
          : "Connect Wallet"}
    </button>
  );
}

/**
 * Header — small octopus mark + serif wordmark, nav, Connect Wallet button.
 * Porcelain light theme; the hero below carries the royal-blue OCTOPUS spectacle
 * (brief §0A: blue = the stage, light = the workbench).
 */
export default function Header({ menuOpen, onToggle }: { menuOpen: boolean; onToggle: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-paper/95 backdrop-blur">
      <div className="royal-frame h-1 w-full" aria-hidden />
      <div className="border-b border-hairline">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 lg:px-10">
          <a href="#/" className="flex min-w-0 items-center gap-3">
            <img
              src="/assets/octopus.png"
              alt="Porcelain octopus mark"
              className="h-9 w-9 shrink-0 rounded-full object-cover"
              width={36}
              height={36}
            />
            <span className="wordmark truncate text-xl tracking-wide">Lightkeeper</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate md:flex" aria-label="Sections">
            <a href="#/" className="transition-colors hover:text-ink">Home</a>
            <a href="#/lamps" className="transition-colors hover:text-ink">Lamps</a>
            <a href="#/stack" className="transition-colors hover:text-ink">The Stack</a>
            <a href="#/activity" className="transition-colors hover:text-ink">Keeper's log</a>
          </nav>
          <div className="flex items-center gap-2">
            <span className="chip chip-info hidden lg:inline-flex">{ATLANTIC.name}</span>
            <ConnectButton />
            <button
              onClick={onToggle}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-tintdeep text-ink md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>
      {menuOpen && (
        <nav
          className="border-b border-hairline bg-paper px-5 py-4 md:hidden"
          aria-label="Mobile sections"
        >
          {[
            ["#/", "Home"],
            ["#/lamps", "Lamps"],
            ["#/stack", "The Stack"],
            ["#/activity", "Keeper's log"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={onToggle}
              className="block rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-tint"
            >
              {label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
