/**
 * T01 · Read Contract State — "Ask any contract anything".
 *
 * Tier A: live read-only eth_call reads (no wallet, no signature, costs nothing).
 * Presentation rebuilt on the SHOWTIME standard: 01 Configure → 02 Run
 * (ProgressLoader — one step per real async phase) → 03 Result (ResultCard
 * showpiece with the token name as the big headline).
 *
 * The read flow itself is unchanged: name(), symbol(), decimals(),
 * totalSupply() + optional balanceOf(holder), all pinned to ONE block,
 * optional historical block pin (time-travel) with a vs-latest delta.
 * Raw values are human-formatted with decimals read from the contract
 * itself — never assumed. name()/symbol() fall back to bytes32 decoding
 * (MKR-style tokens). Per-value failures are loud, never silent zeros.
 *
 * This RPC exposes `eth_blockNumber`, NOT `eth_getBlockNumber` (the Chain MCP
 * tool name) — the hardened rpcCall in ../../hooks/useAtlantic normalizes it.
 */
import { useEffect, useRef, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";

const WPHRS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471";

const READ_FNS = [
  { label: "name", sig: "name()", selector: "0x06fdde03", kind: "string" as const },
  { label: "symbol", sig: "symbol()", selector: "0x95d89b41", kind: "string" as const },
  { label: "decimals", sig: "decimals()", selector: "0x313ce567", kind: "uint8" as const },
  { label: "totalSupply", sig: "totalSupply()", selector: "0x18160ddd", kind: "uint256" as const },
];

const BALANCEOF_SELECTOR = "0x70a08231";

/** Marker for the honest empty state: the address holds no code. */
class NoCodeError extends Error {}

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

/** Lossy float only for the animated stat display — the exact raw string lives in the rows. */
function unitsToFloat(raw: bigint, decimals: number | null): number {
  const d = decimals ?? 0;
  return Number(raw) / 10 ** d;
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

/** One ProgressLoader step per real async phase — built at submit time so the
 * balanceOf step only exists when a holder is actually being read. */
function buildSteps(holder: string): string[] {
  return [
    "Pinning block…",
    "Checking contract code…",
    holder === ""
      ? "Reading name/symbol/decimals/totalSupply…"
      : "Reading name/symbol/decimals/totalSupply + balanceOf…",
  ];
}

export default function TryReadContractState({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [address, setAddress] = useState(WPHRS);
  const [holder, setHolder] = useState("");
  const [blockInput, setBlockInput] = useState("");
  const [addrTouched, setAddrTouched] = useState(false);

  const [data, setData] = useState<ReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState<Target | null>(null);

  const runSeq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const addrValid = isValidAddress(address);
  const holderTrimmed = holder.trim();
  const holderValid = holderTrimmed === "" || isValidAddress(holderTrimmed);
  const blockTrimmed = blockInput.trim();
  const blockValid = blockTrimmed === "" || /^\d{1,10}$/.test(blockTrimmed);

  const setStepsSafe = (n: number, seq: number) => {
    if (mounted.current && runSeq.current === seq) setStep(n);
  };

  async function run(t: Target, runSteps: string[], seq: number) {
    const to = t.address;
    const alive = () => mounted.current && runSeq.current === seq;

    // Phase 0 — pin the block.
    setStepsSafe(0, seq);
    const latestHex = (await rpcCall("eth_blockNumber", [])) as string;
    const latest = Number(BigInt(latestHex));
    const pinNum = t.blockNum ?? latest;
    if (pinNum > latest) {
      throw new Error(
        `Block ${pinNum.toLocaleString("en-US")} is in the future — Atlantic is only at block ` +
          `${latest.toLocaleString("en-US")} right now. Pick a block at or below ` +
          `${latest.toLocaleString("en-US")}, or leave the block empty for latest.`
      );
    }
    const blockHex = "0x" + pinNum.toString(16);
    const historical = pinNum < latest;

    // Phase 1 — bytecode check at the pinned block.
    setStepsSafe(1, seq);
    const code = (await rpcCall("eth_getCode", [to, blockHex])) as string;
    if (!code || code === "0x") {
      throw new NoCodeError(
        historical
          ? `No contract code at this address at block ${pinNum.toLocaleString("en-US")} — ` +
            "the contract was probably deployed later. Try a more recent block, or leave the block empty for latest."
          : "This address holds no contract code — it is a wallet, not a contract. " +
            "Contract state can only be read from a deployed contract."
      );
    }

    // Phase 2 — the real reads. Block timestamp (best-effort) rides alongside.
    setStepsSafe(2, seq);
    const blockInfoP = rpcCall("eth_getBlockByNumber", [blockHex, false])
      .then((b) => b as { timestamp?: string } | null)
      .catch(() => null);

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
    if (t.holder !== "") {
      const arg = t.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      jobs.push(
        readOne(
          `balanceOf(${t.holder.slice(0, 6)}…${t.holder.slice(-4)})`,
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
        .then((raw) =>
          typeof raw === "string" && raw !== "0x" && raw !== "" ? hexToBigInt(raw) : null
        )
        .catch(() => null);
      if (t.holder !== "") {
        const arg = t.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
        latestBalanceP = (
          rpcCall("eth_call", [{ to, data: BALANCEOF_SELECTOR + arg }, latestHex]) as Promise<string>
        )
          .then((raw) =>
            typeof raw === "string" && raw !== "0x" && raw !== "" ? hexToBigInt(raw) : null
          )
          .catch(() => null);
      }
    }

    const values = await Promise.all(jobs);
    const [blockInfo, latestSupply, latestBalance] = await Promise.all([
      blockInfoP,
      latestSupplyP ?? Promise.resolve(null),
      latestBalanceP ?? Promise.resolve(null),
    ]);

    // Human formatting pass — decimals come from the contract's own decimals() read.
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

    if (!alive()) return;
    setStepsSafe(runSteps.length, seq);
    setData({
      targetKey: t.key,
      address: to,
      blockHex,
      blockNum: pinNum,
      blockAgeSec,
      historical,
      latestBlock: latest,
      values,
    });
  }

  const submit = (targetAddr?: string, targetHolder?: string) => {
    const addr = (targetAddr ?? address).trim();
    const hold = (targetHolder ?? holderTrimmed).trim();
    setAddrTouched(true);
    if (!isValidAddress(addr) || (hold !== "" && !isValidAddress(hold)) || !blockValid) return;
    const t: Target = {
      address: addr,
      holder: hold,
      blockNum: blockTrimmed === "" ? null : Number(blockTrimmed),
      key: "",
    };
    t.key = `${t.address.toLowerCase()}|${t.holder.toLowerCase()}|${t.blockNum ?? "latest"}`;
    const runSteps = buildSteps(t.holder);
    const seq = ++runSeq.current;
    setSteps(runSteps);
    setStep(0);
    setLoading(true);
    setError(null);
    setEmptyMsg(null);
    setData(null);
    setLastTarget(t);
    run(t, runSteps, seq)
      .catch((e: unknown) => {
        if (!mounted.current || runSeq.current !== seq) return;
        if (e instanceof NoCodeError) {
          setEmptyMsg(e.message);
        } else {
          setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
        }
      })
      .finally(() => {
        if (mounted.current && runSeq.current === seq) setLoading(false);
      });
  };

  const read = () => submit();

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") read();
  };

  // Only ever show results that belong to the currently submitted target —
  // never a stale read from a previous address after a failed attempt.
  const fresh = data && lastTarget && !loading && data.targetKey === lastTarget.key ? data : null;
  const okCount = fresh?.values.filter((v) => v.ok).length ?? 0;
  const failCount = (fresh?.values.length ?? 0) - okCount;

  const nameRow = fresh?.values.find((v) => v.label === "name");
  const symbolRow = fresh?.values.find((v) => v.label === "symbol");
  const decimalsRow = fresh?.values.find((v) => v.label === "decimals");
  const supplyRow = fresh?.values.find((v) => v.label === "totalSupply");
  const balanceRow = fresh?.values.find((v) => v.label.startsWith("balanceOf"));
  const decimals = decimalsRow?.ok ? (decimalsRow.decimals ?? null) : null;
  const unit = symbolRow?.ok && symbolRow.decoded ? symbolRow.decoded : "tokens";

  const headline =
    nameRow?.ok && nameRow.decoded
      ? nameRow.decoded
      : symbolRow?.ok && symbolRow.decoded
        ? symbolRow.decoded
        : "Contract state";

  const sublineBits: string[] = [];
  if (symbolRow?.ok && symbolRow.decoded) sublineBits.push(symbolRow.decoded);
  if (decimals !== null) sublineBits.push(`${decimals} decimals`);
  sublineBits.push(
    fresh?.historical
      ? `read exactly as it was at block ${fresh.blockNum.toLocaleString("en-US")}`
      : "read live from the latest block"
  );

  const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="space-y-6">
      {/* ── 01 · Configure ─────────────────────────────────────────── */}
      <section aria-label="Configure">
        <p className="text-sm font-semibold text-slate">01 · Configure</p>
        <h3 className="mt-1 font-display text-2xl tracking-tight text-ink">
          Ask any contract anything
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
          Paste an ERC-20 contract address and LIGHTKEEPER reads{" "}
          <span className="font-mono">name()</span>, <span className="font-mono">symbol()</span>,{" "}
          <span className="font-mono">decimals()</span> and <span className="font-mono">totalSupply()</span>{" "}
          live — all pinned to a single block. Free reads on the Atlantic network, no wallet, no
          signature. Add a past block to time-travel and see the state as it was then.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label
              htmlFor="t01-address"
              className="mb-1.5 block text-sm font-semibold text-slate"
            >
              Contract address
            </label>
            <input
              id="t01-address"
              className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={onEnter}
              spellCheck={false}
            />
            {addrTouched && !addrValid && (
              <p className="mt-1.5 text-sm text-fail">
                That doesn't look like an address — it needs to be 0x followed by 40 hex characters.
              </p>
            )}
            <button
              type="button"
              className="mt-2 text-sm font-medium text-accent hover:underline"
              onClick={() => {
                setAddress(WPHRS);
                setHolder("");
              }}
            >
              Use WPHRS, the canonical wrapped token
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="t01-holder"
                className="mb-1.5 block text-sm font-semibold text-slate"
              >
                Holder address <span className="font-normal">(optional — adds balanceOf)</span>
              </label>
              <input
                id="t01-holder"
                className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
                placeholder="0x… (leave empty to skip)"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                onKeyDown={onEnter}
                spellCheck={false}
              />
              {holderTrimmed !== "" && !holderValid && (
                <p className="mt-1.5 text-sm text-fail">
                  The holder address must be 0x + 40 hex characters, or left empty.
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="t01-block"
                className="mb-1.5 block text-sm font-semibold text-slate"
              >
                Block <span className="font-normal">(optional — time-travel)</span>
              </label>
              <input
                id="t01-block"
                className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
                placeholder="e.g. 30000000 (empty = latest)"
                value={blockInput}
                onChange={(e) => setBlockInput(e.target.value)}
                onKeyDown={onEnter}
                spellCheck={false}
                inputMode="numeric"
              />
              {addrTouched && !blockValid && (
                <p className="mt-1.5 text-sm text-fail">
                  Block must be a plain number (e.g. 30000000), or left empty for the latest block.
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary mt-4 min-h-[44px]"
          onClick={read}
          disabled={loading}
        >
          {loading ? "Reading…" : "Read contract state"}
        </button>
      </section>

      {/* ── 02 · Run ───────────────────────────────────────────────── */}
      {loading && (
        <section aria-label="Run">
          <p className="mb-2 text-sm font-semibold text-slate">02 · Run</p>
          <ProgressLoader
            steps={steps}
            current={step}
            title={`Reading ${truncAddr(lastTarget?.address ?? address)} on Atlantic`}
          />
        </section>
      )}

      {/* ── 03 · Result ────────────────────────────────────────────── */}
      {!loading && (fresh || error || emptyMsg) && (
        <section aria-label="Result">
          <p className="mb-2 text-sm font-semibold text-slate">03 · Result</p>

          {error && (
            <ErrorState
              title="The read failed"
              message={error}
              hint="Nothing was fabricated: any value below would have been a real on-chain read, or it isn't shown at all. Fix the input above, or retry."
              retryLabel="Retry the read"
              onRetry={() => lastTarget && submit(lastTarget.address, lastTarget.holder)}
            />
          )}

          {emptyMsg && (
            <EmptyState
              title="No contract here"
              message={emptyMsg}
              actionLabel="Try another address"
              onAction={() => setEmptyMsg(null)}
            />
          )}

          {fresh && (
            <div className="space-y-6">
              <ResultCard
                eyebrow={`Read at block ${fresh.blockNum.toLocaleString("en-US")} · ${fresh.historical ? "historical pin" : "latest"} · ${okCount} of ${fresh.values.length} values read`}
                headline={headline}
                subline={sublineBits.join(" · ")}
                copyValue={fresh.address}
                status="neutral"
                rows={[
                  {
                    label: "Contract",
                    value: (
                      <span title={fresh.address}>{truncAddr(fresh.address)}</span>
                    ),
                  },
                  {
                    label: "Block",
                    value: (
                      <span>
                        {fresh.blockNum.toLocaleString("en-US")}{" "}
                        <span className="text-slate">{fresh.blockHex}</span>
                        {fresh.blockAgeSec !== null && (
                          <span className="text-slate"> · {formatAge(fresh.blockAgeSec)}</span>
                        )}
                      </span>
                    ),
                  },
                  ...(supplyRow?.ok && supplyRow.decoded
                    ? [
                        {
                          label: "Total supply (raw)",
                          value: <span className="break-all">{supplyRow.decoded}</span>,
                        },
                      ]
                    : []),
                  ...(balanceRow?.ok && balanceRow.decoded
                    ? [
                        {
                          label: "Holder balance (raw)",
                          value: <span className="break-all">{balanceRow.decoded}</span>,
                        },
                      ]
                    : []),
                ]}
                links={[
                  {
                    label: "View contract on the explorer",
                    href: `${EXPLORER_ADDRESS}${fresh.address}`,
                  },
                ]}
              >
                <StatStrip
                  stats={[
                    ...(supplyRow?.ok && supplyRow.big !== undefined
                      ? [
                          {
                            label: "Total supply",
                            value: unitsToFloat(supplyRow.big, decimals),
                            format: (n: number) =>
                              n.toLocaleString("en-US", { maximumFractionDigits: 4 }),
                            suffix: decimals !== null ? unit : "raw units",
                          },
                        ]
                      : []),
                    ...(decimals !== null
                      ? [{ label: "Decimals", value: decimals, format: (n: number) => String(Math.round(n)) }]
                      : []),
                    {
                      label: "Block",
                      value: fresh.blockNum,
                      format: (n: number) => Math.round(n).toLocaleString("en-US"),
                    },
                    ...(balanceRow?.ok && balanceRow.big !== undefined
                      ? [
                          {
                            label: "Holder balance",
                            value: unitsToFloat(balanceRow.big, decimals),
                            format: (n: number) =>
                              n.toLocaleString("en-US", { maximumFractionDigits: 4 }),
                            suffix: decimals !== null ? unit : "raw units",
                          },
                        ]
                      : []),
                  ]}
                />

                <div className="rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
                  <h4 className="text-base font-semibold text-ink">Everything that was read</h4>
                  <p className="mt-1 text-sm text-slate">
                    Each call went out in one parallel batch at the same pinned block. Failed
                    reads say so loudly — never a silent zero.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {fresh.values.map((v) => (
                      <li key={v.sig + v.label} className="border-t border-hairline pt-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-mono text-sm font-semibold text-ink">{v.sig}</span>
                          <span className="font-mono text-xs text-slate">{v.selector}</span>
                        </div>
                        {v.ok ? (
                          <div className="mt-1">
                            <p className="text-sm text-ink">{v.human}</p>
                            {v.note && <p className="mt-0.5 text-sm text-slate">{v.note}</p>}
                            {v.raw && (
                              <p className="mt-0.5 truncate font-mono text-xs text-slate" title={v.raw}>
                                raw {v.raw.length > 40 ? `${v.raw.slice(0, 38)}…` : v.raw}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm font-medium text-fail">{v.failure}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {failCount > 0 && (
                    <p className="mt-4 text-sm text-slate">
                      {failCount} of {fresh.values.length} calls failed — those functions aren't
                      implemented by this contract. The values above are the real reads.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => lastTarget && submit(lastTarget.address, lastTarget.holder)}
                  >
                    Refresh (free)
                  </button>
                  <p className="text-xs text-slate">
                    Read-only <span className="font-mono">eth_call</span> via the Atlantic public
                    RPC — the same primitive as Chain MCP's{" "}
                    <span className="font-mono">eth_call</span> tool. No private keys, no wallet,
                    no gas spent.
                  </p>
                </div>
              </ResultCard>
            </div>
          )}
        </section>
      )}

      {/* Initial honest empty — no read has ever run. */}
      {!loading && !fresh && !error && !emptyMsg && (
        <EmptyState
          title="Nothing read yet"
          message="The contract address field is pre-filled with WPHRS, the canonical wrapped token. Press Read contract state to see its live on-chain state — name, symbol, decimals and total supply, all pinned to one block."
          actionLabel="Read the WPHRS contract"
          onAction={() => submit(WPHRS, "")}
        />
      )}
    </div>
  );
}
