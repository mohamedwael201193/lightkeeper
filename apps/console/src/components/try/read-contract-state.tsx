/**
 * T01 · Read Contract State — "Ask any contract anything".
 *
 * Tier A: live read-only eth_call reads on Pharos Atlantic (chain 688689).
 * No wallet, no signature, costs nothing.
 *
 * Address in -> name(), symbol(), decimals(), totalSupply() + optional
 * balanceOf(holder), all pinned to one block (block number shown). Raw values
 * are human-formatted with decimals read from the contract itself — never
 * assumed. Per-value failures are loud (reverted / not implemented), never
 * silent zeros. Empty or non-contract addresses get a plain-language empty
 * state, never a fabricated result.
 */
import { useEffect, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";

const WPHRS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471";

const READ_FNS = [
  { label: "name", sig: "name()", selector: "0x06fdde03", kind: "string" as const },
  { label: "symbol", sig: "symbol()", selector: "0x95d89b41", kind: "string" as const },
  { label: "decimals", sig: "decimals()", selector: "0x313ce567", kind: "uint8" as const },
  { label: "totalSupply", sig: "totalSupply()", selector: "0x18160ddd", kind: "uint256" as const },
];

const BALANCEOF_SELECTOR = "0x70a08231";

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

/** Decode an ABI-encoded string return (offset word + length word + data). */
function decodeAbiString(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length < 128) throw new Error("short string return");
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  const data = h.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(data.match(/../g)!.map((b) => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
}

/** Human-format raw units with 4 decimals: 2500000000000000 @18d -> "0.0025". */
function formatUnits(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = abs / scale;
  const fracFull = (abs % scale).toString().padStart(decimals, "0").slice(0, 4);
  return `${neg ? "-" : ""}${intPart.toString()}.${fracFull}`;
}

interface ValueRead {
  label: string;
  sig: string;
  selector: string;
  ok: boolean;
  raw?: string;
  decoded?: string;
  human?: string;
  failure?: string;
}

interface ReadResult {
  address: string;
  blockHex: string;
  blockNum: number;
  values: ValueRead[];
}

export default function TryReadContractState({ lamp }: { lamp: Lamp }) {
  const [address, setAddress] = useState(WPHRS);
  const [holder, setHolder] = useState("");
  const [target, setTarget] = useState<{ address: string; holder: string } | null>(null);
  const [addrTouched, setAddrTouched] = useState(false);

  const addrValid = isValidAddress(address);
  const holderTrimmed = holder.trim();
  const holderValid = holderTrimmed === "" || isValidAddress(holderTrimmed);

  const { data, loading, error, refetch } = useAtlanticRead<ReadResult>(
    async () => {
      if (!target) throw new Error("no target");
      const to = target.address;

      // 1. Pin one block for every read.
      const blockHex = (await rpcCall("eth_getBlockNumber", [])) as string;
      const blockNum = Number(BigInt(blockHex));

      // 2. Bytecode check — never read state from a wallet address.
      const code = (await rpcCall("eth_getCode", [to, blockHex])) as string;
      if (!code || code === "0x") {
        throw new Error(
          "No contract code at this address — it is a wallet (EOA), not a contract. " +
            "Contract state can only be read from a deployed contract."
        );
      }

      const callAt = async (data: string): Promise<string> => {
        const res = (await rpcCall("eth_call", [{ to, data }, blockHex])) as string;
        if (!res || res === "0x") throw new Error("empty return");
        return res;
      };

      const values: ValueRead[] = [];
      let decimals: number | null = null;

      for (const fn of READ_FNS) {
        const v: ValueRead = { label: fn.label, sig: fn.sig, selector: fn.selector, ok: false };
        try {
          const raw = await callAt(fn.selector);
          v.raw = raw;
          if (fn.kind === "string") {
            v.decoded = decodeAbiString(raw);
            v.human = `"${v.decoded}"`;
          } else if (fn.kind === "uint8") {
            const d = Number(hexToBigInt(raw));
            decimals = d;
            v.decoded = String(d);
            v.human = `${d} decimals (read from the contract — never assumed)`;
          } else {
            v.decoded = hexToBigInt(raw).toString();
            v.human =
              decimals !== null
                ? `${formatUnits(hexToBigInt(raw), decimals)} (raw ÷ 10^${decimals})`
                : `${v.decoded} raw units (decimals() reverted — shown raw, not guessed)`;
          }
          v.ok = true;
        } catch {
          v.failure = "call reverted — this contract does not implement " + fn.sig;
        }
        values.push(v);
      }

      if (target.holder !== "") {
        const v: ValueRead = {
          label: `balanceOf(${target.holder.slice(0, 6)}…${target.holder.slice(-4)})`,
          sig: "balanceOf(address)",
          selector: BALANCEOF_SELECTOR,
          ok: false,
        };
        try {
          const arg = target.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
          const raw = await callAt(BALANCEOF_SELECTOR + arg);
          const big = hexToBigInt(raw);
          v.raw = raw;
          v.decoded = big.toString();
          v.human =
            decimals !== null
              ? `${formatUnits(big, decimals)} (raw ÷ 10^${decimals})`
              : `${v.decoded} raw units`;
          v.ok = true;
        } catch {
          v.failure = "call reverted — this contract does not implement balanceOf(address)";
        }
        values.push(v);
      }

      return { address: to, blockHex, blockNum, values };
    },
    [target],
    { auto: false }
  );

  const read = () => {
    setAddrTouched(true);
    if (!addrValid || !holderValid) return;
    setTarget({ address: address.trim(), holder: holderTrimmed });
  };

  // Run the (free, read-only) read whenever a new target is submitted.
  useEffect(() => {
    if (target) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const okCount = data?.values.filter((v) => v.ok).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Ask any contract anything</h3>
        <p className="text-sm text-slate">
          Paste an ERC-20 contract address — LIGHTKEEPER reads <span className="font-mono">name()</span>,{" "}
          <span className="font-mono">symbol()</span>, <span className="font-mono">decimals()</span> and{" "}
          <span className="font-mono">totalSupply()</span> live from Pharos Atlantic (chain 688689),
          all pinned to a single block. Free reads, no wallet, no signature. Defaults to WPHRS, the
          canonical wrapped token from the Pharos token registry. ({lamp.name})
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Contract address
          </label>
          <input
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
          />
          {addrTouched && !addrValid && (
            <p className="mt-1 text-sm text-fail">
              That doesn't look like an address — it needs to be 0x followed by 40 hex characters.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Holder address <span className="font-normal normal-case">(optional — for balanceOf)</span>
          </label>
          <input
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x… (leave empty to skip)"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            spellCheck={false}
          />
          {holderTrimmed !== "" && !holderValid && (
            <p className="mt-1 text-sm text-fail">
              The holder address must be 0x + 40 hex characters, or left empty.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={read} disabled={loading}>
          {loading ? "Reading from Atlantic…" : "Read contract state"}
        </button>
        {data && !loading && (
          <button className="btn-outline" onClick={refetch}>
            Refresh (free)
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate">Reading live from Atlantic — reads cost nothing…</p>}

      {error && (
        <div className="empty-panel px-5 py-4">
          <p className="text-sm font-semibold text-ink">The read failed — loudly, not silently.</p>
          <p className="mt-1 text-sm text-slate">{error}</p>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm font-semibold text-ink">Nothing read yet.</p>
          <p className="mt-1 text-sm text-slate">
            Paste any contract address above and press <strong>Read contract state</strong>. If the
            address holds no code, or a function isn't implemented, you'll get a plain-language
            explanation — never a fabricated value.
          </p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">read at block {data.blockNum.toLocaleString()}</span>
            <span className="chip font-mono">{data.blockHex}</span>
            <a
              className="font-mono text-xs text-accent hover:underline"
              href={`${EXPLORER_ADDRESS}${data.address}`}
              target="_blank"
              rel="noreferrer"
            >
              view contract on explorer
            </a>
            <span className="text-xs text-slate">
              {okCount} of {data.values.length} values read — every read used the same pinned block
            </span>
          </div>

          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">value</th>
                <th className="text-left">decoded</th>
                <th className="text-left">human</th>
              </tr>
            </thead>
            <tbody>
              {data.values.map((v) => (
                <tr key={v.sig + v.label}>
                  <td className="font-mono text-xs">
                    {v.label}
                    <span className="ml-2 text-slate">{v.selector}</span>
                  </td>
                  {v.ok ? (
                    <>
                      <td className="font-mono text-xs">{v.decoded}</td>
                      <td className="text-sm">{v.human}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="text-sm text-fail">
                      {v.failure}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-slate">
            Method: read-only <span className="font-mono">eth_call</span> via the Atlantic public RPC —
            the same primitive as Chain MCP's <span className="font-mono">eth_call</span> tool. No
            private keys, no wallet, no gas spent. LIGHTKEEPER never sees or asks for keys.
          </p>
        </div>
      )}
    </div>
  );
}
