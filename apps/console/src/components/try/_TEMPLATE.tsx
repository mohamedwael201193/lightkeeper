/**
 * TEMPLATE for per-task "try it live" modules.
 *
 * Copy this file to `<lamp-slug>.tsx` (the slug from TaskDetail, e.g. `t04-policy-guard.tsx`)
 * and implement ONE interactive surface for your task:
 *
 *   Tier A — live reads via public RPC (no wallet, costs nothing).
 *            Use `useAtlanticRead` / `rpcCall` from ../../hooks/useAtlantic.
 *   Tier B — propose + sign in the VISITOR's wallet (their address, their testnet PHRS).
 *            Use `useProposeAndSign`; the review step is MANDATORY — show `to`,
 *            `valuePhrs`, the dust warning when `isDustWarning()` is true, and fire
 *            `approve()` only from an explicit visitor click.
 *   Tier C — honest CLI config builder: generate a command/config the visitor copies
 *            into their own terminal. Never sign in the browser.
 *
 * Rules:
 *   - LIGHTKEEPER-first copy. No blue-on-blue text.
 *   - Reuse existing CSS classes: btn-primary, btn-outline, chip, data-table,
 *     code-block, empty-panel, smallcaps.
 *   - No mocks: every live control reads Atlantic or proposes a real visitor-signed tx.
 *   - LIGHTKEEPER never sees or asks for private keys — say so on the page.
 */
import type { Lamp } from "../../types";

export default function TryTemplate({ lamp }: { lamp: Lamp }) {
  return (
    <div className="empty-panel px-5 py-6 text-sm text-slate">
      The task builder hasn't wired the live surface for <strong className="text-ink">{lamp.name}</strong> yet.
    </div>
  );
}
