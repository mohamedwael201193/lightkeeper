# `src/hooks/` — shared Atlantic hooks

The contract every per-task `try/` module codes against. Do not rename or reshape the
exports in `useAtlantic.ts` — 20 task workers build on this API.

## The model (say it on the page, honestly)

- **Tier A — live reads:** plain JSON-RPC to the Atlantic public endpoint. No wallet,
  no signature, costs nothing.
- **Tier B — propose + sign:** the console shows a transaction for review; the **visitor**
  signs and sends it in **their own wallet**, from **their address**, with **their testnet PHRS**.
- **Tier C — CLI config builders:** the console never signs; it generates a command or
  config the visitor copies into their own terminal.

**LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (chain 688689).**

## API

```ts
// Constants
ATLANTIC_RPC_URL        // "https://atlantic.dplabs-internal.com"
ATLANTIC_CHAIN_ID       // 688689
ATLANTIC_CHAIN_ID_HEX   // "0xA8231"
EXPLORER_TX             // "https://atlantic.pharosscan.xyz/tx/"
EXPLORER_ADDRESS        // "https://atlantic.pharosscan.xyz/address/"
DUST_LIMIT_PHRS         // 0.01

// Reads (Tier A)
rpcCall(method: string, params: unknown[]): Promise<unknown>
useAtlanticRead<T>(fn, deps, opts?: { auto?: boolean })
  // -> { data: T | null; loading: boolean; error: string | null; refetch: () => void }
  // auto=true by default; refetch re-runs; errors become plain-language strings.

// Signing (Tier B)
Proposal                // { to: string; valuePhrs: string; data?: string; label: string }
SignState               // "idle" | "review" | "awaiting-signature" | "broadcasting"
                        // | "confirmed" | "blocked" | "error"
useProposeAndSign()
  // -> { state, proposal, txHash, error, propose, approve, cancel }

// Validation helpers
isValidAddress(a: string): boolean        // 0x + 40 hex
phrsToWeiHex(phrs: string): string        // "0.01" -> "0x2386f26fc10000"; throws on bad input
isDustWarning(valuePhrs: string): boolean // true when value > DUST_LIMIT_PHRS
```

## Safety law (enforced inside `useProposeAndSign.approve()`)

1. `window.ethereum` chainId **must** equal `0xA8231` before sending. Wrong network →
   state `"blocked"` with *"Switch your wallet to Pharos Atlantic Testnet…"* — never proceeds.
2. `to` must be `0x` + 40 hex and `valuePhrs` must parse — invalid → `"blocked"` with the reason.
3. `valuePhrs > 0.01` → dust **warning** in the review step (warn, not block).
4. Broadcast happens **only** via `eth_sendTransaction` — signing is 100% in the visitor's
   wallet. Never auto-broadcast, never request private keys, testnet only.
5. After broadcast, poll `eth_getTransactionReceipt` until mined, then set `txHash` +
   `confirmed`. A `0x0` status is reported as reverted, not as success.

## Tier A example — live read, no wallet

```tsx
import { rpcCall, useAtlanticRead } from "../hooks/useAtlantic";
import { EXPLORER_ADDRESS } from "../hooks/useAtlantic";

function TotalSupply({ token }: { token: string }) {
  const { data, loading, error, refetch } = useAtlanticRead(
    async () => {
      const hex = (await rpcCall("eth_call", [
        { to: token, data: "0x18160ddd" }, // totalSupply()
        "latest",
      ])) as string;
      return `${BigInt(hex)} wei`;
    },
    [token]
  );
  if (loading) return <p className="text-sm text-slate">Reading from Atlantic…</p>;
  if (error) return <p className="text-sm text-fail">{error}</p>;
  return (
    <div>
      <p className="font-mono text-sm text-ink">{data}</p>
      <button className="btn-outline" onClick={refetch}>Refresh</button>
    </div>
  );
}
```

Reads cost nothing and need no wallet. Show a Refresh button — `refetch` is free.

## Tier B example — propose, review, visitor signs

```tsx
import { useState } from "react";
import { EXPLORER_TX, isDustWarning, useProposeAndSign } from "../hooks/useAtlantic";
import { useWallet } from "../components/WalletContext";

function DustTransfer({ to }: { to: string }) {
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } = useProposeAndSign();
  const [amount, setAmount] = useState("0.001");

  return (
    <div className="space-y-3">
      <input className="..." value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button
        className="btn-primary"
        onClick={() => propose({ to, valuePhrs: amount, label: `Send ${amount} PHRS` })}
      >
        Propose transfer
      </button>

      {state === "review" && proposal && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <p className="text-sm font-semibold text-ink">{proposal.label}</p>
          <p className="font-mono text-xs text-slate">
            to {proposal.to} · {proposal.valuePhrs} PHRS
          </p>
          {isDustWarning(proposal.valuePhrs) && (
            <p className="text-sm font-semibold text-golddeep">
              Heads-up: above the 0.01 PHRS dust limit — double-check before signing.
            </p>
          )}
          <p className="text-xs text-slate">
            Review in your wallet: signing happens in YOUR wallet with YOUR testnet PHRS.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={approve}>Sign in my wallet</button>
            <button className="btn-outline" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {state === "awaiting-signature" && <p className="text-sm text-slate">Waiting for your wallet…</p>}
      {state === "broadcasting" && <p className="text-sm text-slate">Sent — waiting for Atlantic to mine it…</p>}
      {state === "blocked" && <p className="text-sm text-fail">{error}</p>}
      {state === "error" && <p className="text-sm text-fail">{error}</p>}
      {state === "confirmed" && txHash && (
        <a className="font-mono text-sm text-accent hover:underline"
           href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
          Confirmed — view on the explorer
        </a>
      )}
    </div>
  );
}
```

Rules for Tier B modules:
- The review step is **mandatory** — show `to`, `valuePhrs`, and the dust warning when
  `isDustWarning()` is true. `approve()` must only fire from an explicit visitor click.
- If the wallet is on the wrong network, the hook blocks with a plain-language message —
  render `error` verbatim and offer `connect()` from `WalletContext` to fix it.
- Link `txHash` to `EXPLORER_TX + txHash` once confirmed.

## Tier C example — honest CLI config builder (no browser signing)

```tsx
import { useState } from "react";
import { isValidAddress } from "../hooks/useAtlantic";

function WatcherConfig() {
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const ok = isValidAddress(address);
  const cmd = ok
    ? `cast logs --rpc-url https://atlantic.dplabs-internal.com --address ${address} --from-block latest`
    : "# enter a valid 0x address to generate the command";

  return (
    <div className="space-y-3">
      <input className="..." placeholder="0x contract address"
             value={address} onChange={(e) => setAddress(e.target.value)} />
      <div className="code-block">{cmd}</div>
      <button
        className="btn-outline" disabled={!ok}
        onClick={async () => { await navigator.clipboard.writeText(cmd); setCopied(true); }}
      >
        {copied ? "Copied" : "Copy command"}
      </button>
      <p className="text-xs text-slate">
        Run this in your own terminal — LIGHTKEEPER never executes it for you.
      </p>
    </div>
  );
}
```

## Where try modules live

`src/components/try/<lamp-slug>.tsx` — default-export a component receiving `{ lamp: Lamp }`.
`TryPanel` lazy-loads it by glob; **no registry edits needed**. Absent file → section hidden.
See `src/components/try/_TEMPLATE.tsx` for the starter shape.
