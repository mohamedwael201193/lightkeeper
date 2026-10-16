/**
 * T01 · Read Contract State — "Ask any contract anything".
 *
 * Tier A: live read-only eth_call reads on Pharos Atlantic (chain 688689).
 * No wallet, no signature, costs nothing.
 *
 * Address in -> name(), symbol(), decimals(), totalSupply() + optional
 * balanceOf(holder), all pinned to ONE block. Optional historical block pin:
 * read the same values as they were at any past block (time-travel), with the
 * block's age and a vs-latest delta on supply/balance rows. Raw values are
 * human-formatted with decimals read from the contract itself — never assumed.
 * name()/symbol() fall back to bytes32 decoding (MKR-style tokens). Per-value
 * failures are loud (reverted / empty return / not implemented), never silent
 * zeros. Empty or non-contract addresses get a plain-language empty state,
 * never a fabricated result.
 *
 * RPC quirk (do NOT "fix"): this RPC exposes `eth_blockNumber`, NOT
 * `eth_getBlockNumber` (the Chain MCP tool name) — the latter returns
 * "invalid method". All block tags are 0x-hex strings.
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
  if (h.length < 128 || h.length % 2 !== 0) throw new Error("not an ABI string");
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  if (h.length < 128 + len * 2) throw new Error("short string return");
  const data = h.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(data.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Decode a bytes32-encoded name/symbol (MKR-style tokens return this instead of an ABI string). */
function decodeBytes32(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length !== 64) throw new Error("not bytes32");
  const bytes: number[] = [];
  for (let i = 0; i < 64; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop();
  if (bytes.length === 0) throw new Error("empty bytes32");
  return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
}

/** Human-format raw units: 150993019075259610098101382 @18d -> "150,993,019.0752". */
function formatUnits(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = (abs / scale).toLocaleString("en-US");
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, 4);
  return `${neg ? "-" : ""}${intPart}.${frac}`;
}

function formatAge(ageSec: number): string {
  if (ageSec < 90) return "seconds ago";
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)} min ago`;
  if (ageSec < 172800) return `${Math.floor(ageSec / 3600)} h ago`;
  return `${Math.floor(ageSec / 86400)} d ago`;
}

interface ValueRead {
  label: string;
  sig: string;
  selector: string;
  kind: "string" | "uint8" | "uint256";
  ok: boolean;
  raw?: string;
  decoded?: string;
  human?: string;
  note?: string;
  big?: bigint;
  decimals?: number;
  failure?: string;
}

interface ReadResult {
  targetKey: string;
  address: string;
  blockHex: string;
  blockNum: number;
  blockAgeSec: number | null;
  historical: boolean;
  latestBlock: number;
  values: ValueRead[];
}

interface Target {
  key: string;
  address: string;
  holder: string;
  blockNum: number | null;
}

export default function TryReadContractState({ lamp }: { lamp: Lamp }) {
  const [address, setAddress] = useState(WPHRS);
  const [holder, setHolder] = useState("");
  const [blockInput, setBlockInput] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [addrTouched, setAddrTouched] = useState(false);

  const addrValid = isValidAddress(address);
  const holderTrimmed = holder.trim();
  const holderValid = holderTrimmed === "" || isValidAddress(holderTrimmed);
  const blockTrimmed = blockInput.trim();
  const blockValid = blockTrimmed === "" || /^\d{1,10}$/.test(blockTrimmed);

  const { data, loading, error, refetch } = useAtlanticRead<ReadResult>(
    async () => {
      if (!target) throw new Error("no target");
      const to = target.address;

      // 1. Latest block, then resolve the pin. (eth_blockNumber — NOT eth_getBlockNumber;
      //    this RPC rejects the Chain-MCP-style name with "invalid method".)
      const latestHex = (await rpcCall("eth_blockNumber", [])) as string;
      const latest = Number(BigInt(latestHex));
      const pinNum = target.blockNum ?? latest;
      if (pinNum > latest) {
        throw new Error(
          `Block ${pinNum.toLocaleString("en-US")} is in the future — Atlantic is only at block ` +
            `${latest.toLocaleString("en-US")} right now. Pick a block at or below ` +
            `${latest.toLocaleString("en-US")}, or leave the block empty for latest.`
        );
      }
      const blockHex = "0x" + pinNum.toString(16);
      const historical = pinNum < latest;

      // 2. Bytecode check at the pinned block — never read state from a wallet address,
      //    and a contract that did not exist yet at a historical block fails loudly too.
      const code = (await rpcCall("eth_getCode", [to, blockHex])) as string;
      if (!code || code === "0x") {
        throw new Error(
          historical
            ? `No contract code at this address at block ${pinNum.toLocaleString("en-US")} — ` +
              "the contract was probably deployed later. Try a more recent block, or leave the block empty for latest."
            : "No contract code at this address — it is a wallet (EOA), not a contract. " +
              "Contract state can only be read from a deployed contract."
        );
      }

      // 3. Block timestamp for the age line (best-effort, runs alongside the reads).
      const blockInfoP = rpcCall("eth_getBlockByNumber", [blockHex, false])
        .then((b) => b as { timestamp?: string } | null)
        .catch(() => null);

      // 4. All value reads go out in ONE parallel batch, all at the pinned block.
      const callAt = async (payload: string): Promise<string> => {
        let res: unknown;
        try {
          res = await rpcCall("eth_call", [{ to, data: payload }, blockHex]);
        } catch {
          throw new Error("REVERTED");
        }
        if (typeof res !== "string" || res === "0x" || res === "") throw new Error("EMPTY");
        return res;
      };

      const readOne = async (
        label: string,
        sig: string,
        selector: string,
        kind: ValueRead["kind"],
        payload: string = selector
      ): Promise<ValueRead> => {
        const v: ValueRead = { label, sig, selector, kind, ok: false };
        try {
          const raw = await callAt(payload);
          v.raw = raw;
          if (kind === "string") {
            try {
              v.decoded = decodeAbiString(raw);
            } catch {
              v.decoded = decodeBytes32(raw);
              v.note = "bytes32-encoded (MKR-style), not an ABI string";
            }
            v.human = `"${v.decoded}"`;
          } else if (kind === "uint8") {
            const d = Number(hexToBigInt(raw));
            if (!Number.isSafeInteger(d) || d < 0) throw new Error("bad decimals");
            v.decimals = d;
            v.decoded = String(d);
            v.human = `${d} decimals — read from the contract, never assumed`;
          } else {
            v.big = hexToBigInt(raw);
            v.decoded = v.big.toString();
          }
          v.ok = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "EMPTY") {
            v.failure = `${sig} is not implemented by this contract (call returned empty 0x).`;
          } else if (msg === "REVERTED") {
            v.failure = `${sig} is not implemented by this contract (call reverted on-chain).`;
          } else {
            v.failure = `${sig} is not implemented by this contract (undecodable return).`;
          }
        }
        return v;
      };

      const jobs: Promise<ValueRead>[] = READ_FNS.map((fn) =>
        readOne(fn.label, fn.sig, fn.selector, fn.kind)
      );
      if (target.holder !== "") {
        const arg = target.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
        jobs.push(
          readOne(
            `balanceOf(${target.holder.slice(0, 6)}…${target.holder.slice(-4)})`,
            "balanceOf(address)",
            BALANCEOF_SELECTOR,
            "uint256",
            BALANCEOF_SELECTOR + arg
          )
        );
      }
      // For a historical pin, also read supply (and balance) at latest for the vs-latest delta.
      let latestSupplyP: Promise<bigint | null> | null = null;
      let latestBalanceP: Promise<bigint | null> | null = null;
      if (historical) {
        latestSupplyP = (
          rpcCall("eth_call", [{ to, data: READ_FNS[3].selector }, latestHex]) as Promise<string>
        )
          .then((raw) => (typeof raw === "string" && raw !== "0x" && raw !== "" ? hexToBigInt(raw) : null))
          .catch(() => null);
        if (target.holder !== "") {
          const arg = target.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
          latestBalanceP = (
            rpcCall("eth_call", [{ to, data: BALANCEOF_SELECTOR + arg }, latestHex]) as Promise<string>
          )
            .then((raw) => (typeof raw === "string" && raw !== "0x" && raw !== "" ? hexToBigInt(raw) : null))
            .catch(() => null);
        }
      }

      const values = await Promise.all(jobs);
      const [blockInfo, latestSupply, latestBalance] = await Promise.all([
        blockInfoP,
        latestSupplyP ?? Promise.resolve(null),
        latestBalanceP ?? Promise.resolve(null),
      ]);

      // 5. Human formatting pass — decimals come from the contract's own decimals() read.
      const decimalsRow = values.find((v) => v.label === "decimals");
      const decimals = decimalsRow?.ok ? (decimalsRow.decimals ?? null) : null;
      const symbolRow = values.find((v) => v.label === "symbol");
      const unit = symbolRow?.ok && symbolRow.decoded ? symbolRow.decoded : "tokens";
      for (const v of values) {
        if (v.kind === "uint256" && v.ok && v.big !== undefined) {
          v.human =
            decimals !== null
              ? `${formatUnits(v.big, decimals)} ${unit} (raw ÷ 10^${decimals})`
              : `${v.decoded} raw units — decimals() failed, shown raw, never guessed`;
          if (historical) {
            const base = v.label === "totalSupply" ? latestSupply : latestBalance;
            if (base !== null && base !== undefined) {
              const delta = base - v.big;
              const sign = delta === 0n ? "±" : delta > 0n ? "+" : "−";
              const mag = delta === 0n ? 0n : delta > 0n ? delta : -delta;
              v.note =
                decimals !== null
                  ? `Δ vs latest: ${sign}${formatUnits(mag, decimals)} ${unit}`
                  : `Δ vs latest: ${sign}${mag.toString()} raw units`;
            }
          }
        }
      }

      let blockAgeSec: number | null = null;
      if (blockInfo?.timestamp) {
        const ts = Number(BigInt(blockInfo.timestamp));
        const age = Math.floor(Date.now() / 1000) - ts;
        if (age >= 0 && age < 10 * 365 * 86400) blockAgeSec = age;
      }

      return {
        targetKey: target.key,
        address: to,
        blockHex,
        blockNum: pinNum,
        blockAgeSec,
        historical,
        latestBlock: latest,
        values,
      };
    },
    [target],
    { auto: false }
  );

  const read = () => {
    setAddrTouched(true);
    if (!addrValid || !holderValid || !blockValid) return;
    const t: Target = {
      address: address.trim(),
      holder: holderTrimmed,
      blockNum: blockTrimmed === "" ? null : Number(blockTrimmed),
      key: "",
    };
    t.key = `${t.address.toLowerCase()}|${t.holder.toLowerCase()}|${t.blockNum ?? "latest"}`;
    setTarget(t);
  };

  // Run the (free, read-only) read whenever a new target is submitted.
  useEffect(() => {
    if (target) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") read();
  };

  // Only ever show results that belong to the currently submitted target —
  // never a stale read from a previous address after a failed attempt.
  const fresh = data && target && !loading && data.targetKey === target.key ? data : null;
  const okCount = fresh?.values.filter((v) => v.ok).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Ask any contract anything</h3>
        <p className="text-sm text-slate">
          Paste an ERC-20 contract address — LIGHTKEEPER reads <span className="font-mono">name()</span>,{" "}
          <span className="font-mono">symbol()</span>, <span className="font-mono">decimals()</span> and{" "}
          <span className="font-mono">totalSupply()</span> live from Pharos Atlantic (chain 688689),
          all pinned to a single block. Free reads, no wallet, no signature. Defaults to WPHRS, the
          canonical wrapped token from the Pharos token registry. Add a block number to time-travel:
          read the same values exactly as they were at that block, with a vs-latest delta. ({lamp.name})
        </p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Contract address
          </label>
          <input
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={onEnter}
            spellCheck={false}
          />
          {addrTouched && !addrValid && (
            <p className="mt-1 text-sm text-fail">
              That doesn't look like an address — it needs to be 0x followed by 40 hex characters.
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
              Holder address <span className="font-normal normal-case">(optional — for balanceOf)</span>
            </label>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              placeholder="0x… (leave empty to skip)"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              onKeyDown={onEnter}
              spellCheck={false}
            />
            {holderTrimmed !== "" && !holderValid && (
              <p className="mt-1 text-sm text-fail">
                The holder address must be 0x + 40 hex characters, or left empty.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
              Block <span className="font-normal normal-case">(optional — time-travel)</span>
            </label>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              placeholder="e.g. 30000000 (empty = latest)"
              value={blockInput}
              onChange={(e) => setBlockInput(e.target.value)}
              onKeyDown={onEnter}
              spellCheck={false}
              inputMode="numeric"
            />
            {addrTouched && !blockValid && (
              <p className="mt-1 text-sm text-fail">
                Block must be a plain number (e.g. 30000000), or left empty for the latest block.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={read} disabled={loading}>
          {loading ? "Reading from Atlantic…" : "Read contract state"}
        </button>
        {fresh && !loading && (
          <button className="btn-outline" onClick={refetch}>
            Refresh (free)
          </button>
        )}
        {error && !loading && (
          <button className="btn-outline" onClick={refetch}>
            Retry the read
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate">Reading live from Atlantic — reads cost nothing…</p>}

      {error && !loading && (
        <div className="empty-panel px-5 py-4">
          <p className="text-sm font-semibold text-ink">The read failed — loudly, not silently.</p>
          <p className="mt-1 text-sm text-slate">{error}</p>
          <p className="mt-2 text-xs text-slate">
            Nothing was fabricated: every value below would have been a real on-chain read, or it
            isn't shown at all. Fix the input above, or press <strong>Retry the read</strong>.
          </p>
        </div>
      )}

      {!fresh && !loading && !error && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm font-semibold text-ink">Nothing read yet.</p>
          <p className="mt-1 text-sm text-slate">
            Paste any contract address above and press <strong>Read contract state</strong>. If the
            address holds no code, or a function isn't implemented, you'll get a plain-language
            explanation — never a fabricated value. Pin a past block to see the state as it was
            then, with a vs-latest delta.
          </p>
        </div>
      )}

      {fresh && !loading && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-dim">read at block {fresh.blockNum.toLocaleString("en-US")}</span>
            <span className="chip chip-dim font-mono">{fresh.blockHex}</span>
            {fresh.historical ? (
              <span className="chip chip-info">
                historical pin{fresh.blockAgeSec !== null ? ` · ${formatAge(fresh.blockAgeSec)}` : ""}
              </span>
            ) : (
              <span className="chip chip-pass">latest</span>
            )}
            <a
              className="font-mono text-xs text-accent hover:underline"
              href={`${EXPLORER_ADDRESS}${fresh.address}`}
              target="_blank"
              rel="noreferrer"
            >
              view contract on explorer
            </a>
            <span className="text-xs text-slate">
              {okCount} of {fresh.values.length} values read — every read used the same pinned block
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">value</th>
                  <th className="text-left">decoded</th>
                  <th className="text-left">human</th>
                </tr>
              </thead>
              <tbody>
                {fresh.values.map((v) => (
                  <tr key={v.sig + v.label}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      {v.label}
                      <span className="ml-2 text-slate">{v.selector}</span>
                    </td>
                    {v.ok ? (
                      <>
                        <td className="font-mono text-xs">
                          <span title={v.raw}>{v.decoded}</span>
                          {v.raw && (
                            <div className="mt-1 text-slate" title={v.raw}>
                              {v.raw.length > 22 ? `${v.raw.slice(0, 20)}…` : v.raw}
                            </div>
                          )}
                        </td>
                        <td className="text-sm">
                          {v.human}
                          {v.note && <div className="mt-1 text-xs text-slate">{v.note}</div>}
                        </td>
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
          </div>

          <p className="text-xs text-slate">
            Method: read-only <span className="font-mono">eth_call</span> via the Atlantic public RPC —
            the same primitive as Chain MCP's <span className="font-mono">eth_call</span> tool, fired in
            one parallel batch. No private keys, no wallet, no gas spent. LIGHTKEEPER never sees or
            asks for keys.
          </p>
        </div>
      )}
    </div>
  );
}
