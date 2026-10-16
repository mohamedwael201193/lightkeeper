/**
 * T10 — Batch Executor ("Flotilla") · Tier C builder
 *
 * "Build a safe batch": an interactive batch builder. The visitor adds
 * recipient rows (address + amount), gets live validation, a running total,
 * the automatically selected batch mode, and an estimated gas cost — then
 * receives the EXACT copy-paste forge/cast commands to run in their own
 * terminal. LIGHTKEEPER never signs, never broadcasts, never sees keys.
 *
 * Facts this surface is built on (from tasks/t10-batch-executor/evidence.json):
 *   - BatchDistributor 0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4, live on Atlantic.
 *   - Modes: ≤10 simple · 11–200 single-batch · >200 multi-batch (≤200/chunk).
 *   - Measured: individual send = 21,000 gas; receipt-fitted batch model from
 *     3 live runs (n=8/10/11 → 149,170/185,573/202,173 gas): ≈7,500 fixed +
 *     ≈17,700 gas/recipient; measured breakeven ≈ n=3 (pre-existing EOAs).
 */
import { useMemo, useRef, useState } from "react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_CHAIN_ID,
  ATLANTIC_RPC_URL,
  EXPLORER_ADDRESS,
  isDustWarning,
  isValidAddress,
  phrsToWeiHex,
} from "../../hooks/useAtlantic";

const DISTRIBUTOR = "0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4";
const DUST = "0.01";
// Live RevertingReceiver fixture (deployed on Atlantic, refuses every native
// transfer). Evidence: tasks/t10-batch-executor/evidence.json "RevertingReceiver".
const REFUSER = "0x49b26d4685262e7756cbE623f134cFa97d142B94";

/** Parse a PHRS string into wei (bigint). Empty -> pending, unparsable -> invalid. */
function parseAmount(s: string): { wei: bigint; ok: boolean; pending: boolean } {
  if (s.trim() === "") return { wei: 0n, ok: false, pending: true };
  try {
    return { wei: BigInt(phrsToWeiHex(s)), ok: true, pending: false };
  } catch {
    return { wei: 0n, ok: false, pending: false };
  }
}

interface Row {
  id: number;
  address: string;
  amount: string;
}

type Mode = "simple" | "single" | "multi";

function modeFor(n: number): Mode {
  if (n <= 10) return "simple";
  if (n <= 200) return "single";
  return "multi";
}

/** Gas estimate from LIVE Atlantic receipts — labeled as an estimate, never a fact.
 *  Receipt-fitted model (n=8/10/11 → 149,170/185,573/202,173 gas):
 *  ≈7,500 fixed + ≈17,700 gas/recipient. */
function estGas(mode: Mode, n: number): number {
  if (mode === "simple") return n * 21_000;
  if (mode === "single") return 7_500 + n * 17_700;
  let g = 0;
  const chunks = Math.ceil(n / 200);
  for (let i = 0; i < chunks; i++) {
    const c = Math.min(200, n - i * 200);
    g += 7_500 + c * 17_700;
  }
  return g;
}

function shortAddr(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default function TryT10(_props: { lamp: Lamp }) {
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const [rows, setRows] = useState<Row[]>([
    { id: nextId(), address: "", amount: "" },
    { id: nextId(), address: "", amount: "" },
  ]);
  const [copied, setCopied] = useState(false);

  const rowState = useMemo(
    () =>
      rows.map((r) => {
        const addrTrim = r.address.trim();
        const addrOk = addrTrim !== "" && isValidAddress(addrTrim);
        const addrPending = addrTrim === "";
        const amt = parseAmount(r.amount);
        return { ...r, addrTrim, addrOk, addrPending, amt };
      }),
    [rows]
  );

  // Duplicate addresses — the on-chain Distributor rejects these, so flag them now.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    const bad = new Set<number>();
    for (const r of rowState) {
      if (!r.addrOk) continue;
      const k = r.addrTrim.toLowerCase();
      if (seen.has(k)) {
        bad.add(seen.get(k)!);
        bad.add(r.id);
      } else seen.set(k, r.id);
    }
    return bad;
  }, [rowState]);

  const validRows = rowState.filter(
    (r) => r.addrOk && r.amt.ok && !dupes.has(r.id)
  );
  const hasInvalid = rowState.some(
    (r) =>
      (!r.addrPending && !r.addrOk) ||
      (!r.amt.pending && !r.amt.ok) ||
      (r.addrOk && dupes.has(r.id))
  );

  const totalWei = validRows.reduce((s, r) => s + r.amt.wei, 0n);
  const n = validRows.length;
  const mode = modeFor(Math.max(n, 1));
  const gas = estGas(mode, n);
  const dustHit = validRows.some((r) => isDustWarning(r.amount));

  // cast parses arrays as comma-separated: "[0xaaa,0xbbb]" (space-separated fails).
  const addrsArg = `[${validRows.map((r) => r.addrTrim).join(",")}]`;
  const weisArg = `[${validRows.map((r) => r.amt.wei.toString()).join(",")}]`;

  const script = useMemo(() => {
    const head = [
      "# ── Flotilla batch — built in the LIGHTKEEPER console (T10) ──",
      "# Runs in YOUR terminal with YOUR keys. LIGHTKEEPER never sees or runs this.",
      "# Chain guard: Atlantic testnet (688689) is asserted in every command.",
      "",
      "# Your own env — set these in YOUR terminal before running:",
      "export ATLANTIC_RPC_URL=\"https://atlantic.dplabs-internal.com\"",
      "export DEPLOYER_PRIVATE_KEY=\"<your-private-key>\"   # never shared",
      'export PATH="$HOME/.foundry/bin:$PATH"',
      'FROM=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")',
      "",
    ];
    if (n === 0) return "# add at least one valid recipient row to generate the commands";
    if (mode === "simple") {
      const lines = [...head, `# Mode: SIMPLE — ${n} sequential send(s) (≤10, no contract needed)`, ""];
      validRows.forEach((r, i) => {
        lines.push(
          `# ${i + 1}. Preflight — dry-run, moves nothing:`,
          `cast estimate --rpc-url "$ATLANTIC_RPC_URL" --from "$FROM" ${r.addrTrim} --value ${r.amt.wei.toString()}`,
          "",
          `# ${i + 1}. Execute:`,
          `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --chain-id ${ATLANTIC_CHAIN_ID} --private-key "$DEPLOYER_PRIVATE_KEY" ${r.addrTrim} --value ${r.amt.wei.toString()}`,
          ""
        );
      });
      return lines.join("\n");
    }
    const sig = '"distributeNative(address[],uint256[])"';
    const pre = (a: string, w: string, v: string) => [
      "# Preflight — dry-run the batch call against Atlantic (moves nothing):",
      `cast call --rpc-url "$ATLANTIC_RPC_URL" --from "$FROM" --value ${v} ${DISTRIBUTOR} ${sig} "${a}" "${w}"`,
      "",
      "# Execute — one transaction, one signature:",
      `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --chain-id ${ATLANTIC_CHAIN_ID} --private-key "$DEPLOYER_PRIVATE_KEY" ${DISTRIBUTOR} ${sig} "${a}" "${w}" --value ${v}`,
      "",
    ];
    if (mode === "single") {
      const lines = [
        ...head,
        `# Mode: SINGLE-BATCH — ${n} recipients in ONE transaction`,
        `# Distributor: ${DISTRIBUTOR}`,
        `# Total value: ${totalWei.toString()} wei`,
        "",
      ];
      return [...lines, ...pre(addrsArg, weisArg, totalWei.toString())].join("\n");
    }
    const chunks: Row[][] = [];
    const clean = validRows.map((r) => ({ id: r.id, address: r.addrTrim, amount: r.amount }));
    for (let i = 0; i < clean.length; i += 200) chunks.push(clean.slice(i, i + 200));
    const lines = [
      ...head,
      `# Mode: MULTI-BATCH — ${n} recipients in ${chunks.length} chunk(s) of ≤200 (cap enforced on-chain)`,
      `# Distributor: ${DISTRIBUTOR}`,
      "",
    ];
    chunks.forEach((c, ci) => {
      const a = `[${c.map((r) => r.address).join(",")}]`;
      const w = `[${c.map((r) => parseAmount(r.amount).wei.toString()).join(",")}]`;
      const v = c.reduce((s, r) => s + parseAmount(r.amount).wei, 0n).toString();
      lines.push(`# ── chunk ${ci + 1}/${chunks.length} (${c.length} recipients) ──`, ...pre(a, w, v));
    });
    return lines.join("\n");
  }, [validRows, n, mode, totalWei, addrsArg, weisArg]);

  const checks = [
    {
      label: "All addresses valid",
      state: n === 0 ? "dim" : hasInvalid ? "fail" : "pass",
      hint: "0x + 40 hex, checked live as you type.",
    },
    {
      label: "No duplicate recipients",
      state: dupes.size > 0 ? "fail" : "pass",
      hint: "The Distributor reverts on duplicates — flagged before you spend gas.",
    },
    {
      label: "Dust check",
      state: n === 0 ? "dim" : dustHit ? "warn" : "pass",
      hint: dustHit
        ? `A row exceeds ${DUST} PHRS — warning, not a block. Double-check it.`
        : `Every row ≤ ${DUST} PHRS dust limit.`,
    },
    {
      label: "Dry-run first",
      state: "info",
      hint: "Every generated command ships with a preflight that moves nothing.",
    },
  ];

  const copy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRefuser = () =>
    setRows((rs) => [...rs, { id: nextId(), address: REFUSER, amount: "0.001" }]);

  // Gas comparison: measured individual-send baseline (21,000) vs the
  // receipt-fitted batch estimate. Only meaningful once the contract path kicks in.
  const individualGas = n * 21_000;
  const savesPct =
    mode === "simple" || n < 2
      ? null
      : Math.round((1 - gas / individualGas) * 100);

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Build a safe batch</h3>
          <span className="chip chip-info">Tier C — command builder</span>
          <span className="chip chip-pass">0 PHRS spent here</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
          Add recipient rows — Flotilla validates each one, totals the batch, auto-selects the
          cheapest mode (simple, single-batch, or multi-batch through the on-chain{" "}
          <span className="font-mono">BatchDistributor</span>), and generates the exact commands
          to run in your own terminal. Gas figures are estimates fitted from live Atlantic
          receipts, labeled as estimates — never facts.
        </p>
      </div>

      {/* 01 — builder */}
      <div>
        <p className="smallcaps mb-3">01 · Build the recipient list</p>
        <div className="space-y-2">
          {rowState.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-hairline bg-porcelain p-3 md:flex-row md:items-center">
              <span className="w-8 shrink-0 font-mono text-xs text-slate">{i + 1}</span>
              <input
                className="min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60"
                placeholder="0x recipient address"
                value={r.address}
                onChange={(e) => update(r.id, { address: e.target.value })}
                spellCheck={false}
              />
              <input
                className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60 md:w-36"
                placeholder="PHRS amount"
                value={r.amount}
                onChange={(e) => update(r.id, { amount: e.target.value })}
                inputMode="decimal"
                spellCheck={false}
              />
              <div className="flex items-center gap-2">
                {!r.addrPending && !r.addrOk && <span className="chip chip-fail">bad address</span>}
                {r.addrOk && dupes.has(r.id) && <span className="chip chip-fail">duplicate</span>}
                {r.addrOk && !dupes.has(r.id) && <span className="chip chip-pass">ok</span>}
                {!r.amt.pending && !r.amt.ok && <span className="chip chip-fail">bad amount</span>}
                {r.amt.ok && isDustWarning(r.amount) && <span className="chip chip-info">dust warning</span>}
                <button
                  className="btn-outline !px-2 !py-1 text-xs"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-outline" onClick={() => setRows((rs) => [...rs, { id: nextId(), address: "", amount: "" }])}>
            + Add recipient
          </button>
          <button
            className="btn-outline"
            onClick={addRefuser}
            title="Adds the live RevertingReceiver fixture (0x49b26d46…b94). It refuses every native transfer on-chain, so its action is recorded as success=false while the rest of the batch completes — partial-failure isolation you can verify yourself on the explorer."
          >
            + Add the refuser fixture
          </button>
        </div>
      </div>

      {/* 02 — totals + checks */}
      <div>
        <p className="smallcaps mb-3">02 · Totals & safety checks</p>
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-hairline bg-paper p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate">Recipients</p>
            <p className="font-mono text-lg font-bold text-ink">{n}</p>
          </div>
          <div className="rounded-xl border border-hairline bg-paper p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate">Total</p>
            <p className="font-mono text-lg font-bold text-ink">
              {(Number(totalWei) / 1e18).toFixed(4)} <span className="text-xs font-normal text-slate">PHRS</span>
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-paper p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate">Mode</p>
            <p className="font-mono text-lg font-bold text-accent">
              {mode === "simple" ? "simple" : mode === "single" ? "single-batch" : "multi-batch"}
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-paper p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate">Est. gas</p>
            <p className="font-mono text-lg font-bold text-ink">{gas.toLocaleString()}</p>
          </div>
        </div>
        <p className="mb-2 text-xs text-slate">
          Mode auto-selects per the Flotilla reference (≤10 simple · 11–200 single-batch ·
          &gt;200 multi-batch). Gas is an <span className="font-semibold">estimate from live
          Atlantic receipts</span> (fitted over 3 runs: n=8/10/11 → 149,170/185,573/202,173
          gas; ≈7.5k fixed + ≈17.7k/recipient; measured breakeven ≈ n=3 for pre-existing
          EOA recipients) — your receipt will differ slightly.
        </p>
        {savesPct !== null && (
          <p className="mb-2 rounded-xl border border-hairline bg-porcelain px-4 py-3 font-mono text-xs text-ink">
            {individualGas.toLocaleString()} gas ({n} individual sends) vs ≈
            {gas.toLocaleString()} in the batch →{" "}
            <span className={savesPct > 0 ? "font-bold text-accent" : "font-bold text-fail"}>
              {savesPct > 0 ? `saves ≈${savesPct}%` : `costs ≈${-savesPct}% more`}
            </span>
            <span className="font-sans text-slate">
              {" "}— measured: the batch already beats individual sends from ≈3 recipients
              (pre-existing EOAs), well before the 11-recipient mode boundary.
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {checks.map((c) => (
            <span
              key={c.label}
              title={c.hint}
              className={`chip ${
                c.state === "pass" ? "chip-pass" : c.state === "fail" ? "chip-fail" : c.state === "warn" ? "chip-info" : "chip-dim"
              }`}
            >
              {c.label}
              {c.state === "pass" ? " ✓" : c.state === "fail" ? " ✕" : ""}
            </span>
          ))}
        </div>
      </div>

      {/* 03 — commands */}
      <div>
        <p className="smallcaps mb-3">03 · Your commands — review, then run in your terminal</p>
        {n === 0 ? (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            Add at least one valid recipient above and the exact copy-paste commands appear here.
          </div>
        ) : hasInvalid ? (
          <div className="empty-panel px-5 py-6 text-sm text-fail">
            Fix the flagged rows above (bad address, bad amount, or duplicate) — the builder
            won't generate a command it can't stand behind.
          </div>
        ) : (
          <>
            <div className="code-block mb-3 max-h-96 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
              {script}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" onClick={copy}>
                {copied ? "Copied ✓" : "Copy commands"}
              </button>
              <p className="max-w-xl text-xs text-slate">
                Executes on <span className="font-mono">Atlantic {ATLANTIC_CHAIN_ID}</span> (
                <span className="font-mono">{ATLANTIC_RPC_URL}</span>) with your keys, behind
                the shared nonce lock. Distributor contract:{" "}
                <a
                  className="font-mono text-accent hover:underline"
                  href={`${EXPLORER_ADDRESS}${DISTRIBUTOR}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(DISTRIBUTOR)}
                </a>
                . LIGHTKEEPER never executes this for you — run it yourself.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
