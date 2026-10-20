import { useCallback, useEffect, useRef, useState } from "react";
// @lightkeeper/value-format (L4): exact bigint amount math — the hook keeps
// its own UX error messages, the library owns the conversion.
import { parseDecimalToBigint } from "../../../../packages/value-format/src/index";

/**
 * Shared Atlantic hooks — the contract every per-task "try" module codes against.
 *
 * TIERS
 *   Tier A — live reads via public RPC (no wallet, costs nothing).
 *   Tier B — propose + sign in the VISITOR's wallet (visitor's address, visitor's PHRS).
 *   Tier C — honest CLI config builders (no signing in the browser at all).
 *
 * SAFETY LAW (enforced in useProposeAndSign.approve()):
 *   - window.ethereum chainId MUST equal ATLANTIC_CHAIN_ID_HEX ("0xA8231") before sending.
 *     Wrong network -> state "blocked" with a plain-language message. Never proceed.
 *   - `to` must be 0x + 40 hex and valuePhrs must parse; invalid -> "blocked" with reason.
 *   - valuePhrs > 0.01 PHRS -> dust WARNING shown in the review step (warn, not block).
 *   - Signing happens 100% in the visitor's wallet via eth_sendTransaction.
 *   - Never auto-broadcast, never request private keys, testnet only.
 */

export const ATLANTIC_RPC_URL = "https://atlantic.dplabs-internal.com";
export const ATLANTIC_CHAIN_ID = 688689;
export const ATLANTIC_CHAIN_ID_HEX = "0xA8231";
export const EXPLORER_TX = "https://atlantic.pharosscan.xyz/tx/";
export const EXPLORER_ADDRESS = "https://atlantic.pharosscan.xyz/address/";

/** Dust threshold: anything above this PHRS value gets a warning in review (not a block). */
export const DUST_LIMIT_PHRS = 0.01;

// ---------------------------------------------------------------------------
// RPC resilience layer (2026-10-16).
//
// ROOT CAUSE of the founder's HTTP 400 (T01 try-it-live): `eth_getBlockNumber`
// is the Chain MCP *tool* name, NOT a JSON-RPC method. This gateway rejects it
// with HTTP 400 carrying JSON-RPC -32601 "invalid method: eth_getBlockNumber";
// the correct method is `eth_blockNumber`. Two try modules shipped the wrong
// name (T01, T13). The old rpcCall threw on !res.ok WITHOUT reading the body,
// so the real cause ("invalid method") was masked behind a bare "HTTP 400".
//
// - METHOD ALIASES: known-wrong names are normalized to the real JSON-RPC
//   method at this single choke point, so any current or future caller works
//   even if its try module still uses the tool name.
// - RETRY: HTTP 400/429/5xx, network errors, and TIMEOUTS are retried with
//   exponential backoff (300ms / 900ms / 2700ms + up to 50% jitter).
//   JSON-RPC application errors (json.error) are real answers from the node
//   and are NEVER retried.
// - TIMEOUT: every request carries a 25s AbortController cap. T18's agent
//   observed eth_getTransactionReceipt on an unknown hash hanging with no
//   response at all (~120s, twice) — any method can stall forever without a
//   cap, so a timeout is treated as a transient "stopped responding" error
//   and retried like any other transient failure.
// - DEDUP: identical in-flight requests (same method+params) share one promise,
//   so N parallel try modules firing eth_blockNumber issue ONE HTTP request.
// - eth_blockNumber is cached ~5s: most try modules pin one block per run,
//   so a burst of reads does not refetch the tip for every call.
//
// rpcCall is read-only in this codebase (writes go through the visitor's own
// wallet), so every retry is idempotent and safe to repeat.
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [300, 900, 2700];
const BLOCKNUMBER_CACHE_TTL_MS = 5000;
/** Per-request ceiling: no RPC call may stall forever (see the hang note below). */
const RPC_TIMEOUT_MS = 25_000;

/** Wrong-name -> real JSON-RPC method. See the root-cause note above. */
const METHOD_ALIASES: Record<string, string> = {
  eth_getBlockNumber: "eth_blockNumber",
};

let rpcIdSeq = 0;
let blockNumberCache: { value: unknown; at: number } | null = null;
const inFlightRpc = new Map<string, Promise<unknown>>();

function rpcSleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function backoffDelayMs(retryIndex: number): number {
  const base = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
  return base + Math.random() * base * 0.5; // up to +50% jitter
}

function dedupKey(method: string, params: unknown[]): string {
  return method + ":" + JSON.stringify(params);
}

/** Plain-language meaning for an HTTP status — a raw code is never shown alone. */
function httpMeaning(status: number): string {
  if (status === 429) return "too many requests";
  if (status === 400) return "the node rejected the request";
  if (status >= 500) return "the node didn't answer properly";
  return "an unexpected response";
}

/**
 * Plain JSON-RPC POST to the Atlantic public RPC — no wallet needed.
 * Retries HTTP 400/429/5xx and network errors with backoff (idempotent reads
 * only); JSON-RPC application errors are real answers, not retried.
 * Throws a plain-language Error on final failure.
 */
export async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  // Normalize known-wrong method names (e.g. the Chain MCP tool name
  // eth_getBlockNumber -> the real JSON-RPC method eth_blockNumber).
  const wireMethod = METHOD_ALIASES[method] ?? method;

  // Fast path: a fresh eth_blockNumber cache — try modules pin one block
  // per run, so repeated tip reads within ~5s share one response.
  if (
    wireMethod === "eth_blockNumber" &&
    params.length === 0 &&
    blockNumberCache &&
    Date.now() - blockNumberCache.at < BLOCKNUMBER_CACHE_TTL_MS
  ) {
    return blockNumberCache.value;
  }

  // Dedup: an identical request already in flight -> share its promise.
  const key = dedupKey(wireMethod, params);
  const existing = inFlightRpc.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<unknown> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await rpcSleep(backoffDelayMs(attempt - 1));
      let res: Response;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
      try {
        // String id with a sequence suffix — Date.now() alone collides when two
        // calls are issued in the same millisecond.
        res = await fetch(ATLANTIC_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `${Date.now()}-${++rpcIdSeq}`,
            method: wireMethod,
            params,
          }),
        });
      } catch {
        // Timeout OR network error: the node stopped responding — retryable.
        // (AbortController abort surfaces as a rejected fetch here.)
        lastError = ctrl.signal.aborted
          ? new Error("The Atlantic RPC stopped responding — retrying.")
          : new Error(
              "The Atlantic RPC did not answer after several attempts — check your connection and retry."
            );
        clearTimeout(timer);
        continue;
      }
      clearTimeout(timer);
      if (!res.ok) {
        // HTTP 400/429/5xx: transient node-side failures — retryable.
        lastError = new Error(
          `The Atlantic RPC returned ${httpMeaning(res.status)} (HTTP ${res.status}) — ` +
            "still failing after several retries. Wait a moment and retry."
        );
        continue;
      }
      const json = (await res.json()) as {
        result?: unknown;
        error?: { message?: string; code?: number };
      };
      if (json.error) {
        // Application-level error: a real answer from the node — never retried.
        throw new Error(
          `Atlantic RPC error: ${json.error.message ?? "unknown error"} (code ${json.error.code ?? "?"})`
        );
      }
      if (wireMethod === "eth_blockNumber" && params.length === 0) {
        blockNumberCache = { value: json.result, at: Date.now() };
      }
      return json.result;
    }
    throw lastError ?? new Error("The Atlantic RPC did not answer — retry in a moment.");
  })();

  inFlightRpc.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlightRpc.get(key) === promise) inFlightRpc.delete(key);
  }
}

export interface UseAtlanticReadOpts {
  /** Run automatically on mount / when deps change. Default true. */
  auto?: boolean;
}

/**
 * Tier A — run an async read (usually rpcCall) and get { data, loading, error, refetch }.
 * Errors become plain-language strings. auto=true by default; refetch re-runs on demand.
 */
export function useAtlanticRead<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  opts?: UseAtlanticReadOpts
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((d) => setData(d))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.")
      )
      .finally(() => setLoading(false));
  }, []);

  const auto = opts?.auto ?? true;
  useEffect(() => {
    if (auto) refetch();
    // deps are caller-owned; fn identity is tracked via fnRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, refetch, ...deps]);

  return { data, loading, error, refetch };
}

export interface Proposal {
  to: string;
  valuePhrs: string;
  data?: string;
  label: string;
}

export type SignState =
  | "idle"
  | "review"
  | "awaiting-signature"
  | "broadcasting"
  | "confirmed"
  | "blocked"
  | "error";

export function isValidAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

/**
 * Parse a decimal PHRS string into a 0x wei hex string.
 * Throws a plain-language Error when the value does not parse.
 */
export function phrsToWeiHex(phrs: string): string {
  const s = phrs.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) {
    throw new Error(`"${phrs}" is not a valid PHRS amount (up to 18 decimals).`);
  }
  return "0x" + parseDecimalToBigint(s, 18).toString(16);
}

/** True when the amount exceeds the dust threshold — review UI must warn (not block). */
export function isDustWarning(valuePhrs: string): boolean {
  try {
    const s = valuePhrs.trim();
    if (!/^\d+(\.\d{1,18})?$/.test(s)) return false;
    const wei = parseDecimalToBigint(s, 18);
    return wei > BigInt(Math.floor(DUST_LIMIT_PHRS * 1e18));
  } catch {
    return false;
  }
}

function chainMismatchError(): string {
  return "Switch your wallet to Pharos Atlantic Testnet to continue — LIGHTKEEPER never moves funds on any other network.";
}

async function currentChainId(): Promise<string | null> {
  try {
    const id = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    return typeof id === "string" ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Tier B — propose a transaction, show it for review, then let the VISITOR sign it
 * in their own wallet. Returns { state, proposal, txHash, error, propose, approve, cancel }.
 *
 * approve() SAFETY LAW (non-negotiable):
 *   1. chainId MUST be 0xA8231 or the flow stops at "blocked" — never proceeds.
 *   2. `to` and valuePhrs are re-validated; invalid -> "blocked" with reason.
 *   3. Broadcasts ONLY via eth_sendTransaction (the visitor's wallet signs and sends).
 *   4. Polls eth_getTransactionReceipt until mined, then sets txHash + confirmed.
 *   5. Never auto-broadcasts, never touches private keys, testnet only.
 */
export function useProposeAndSign(): {
  state: SignState;
  proposal: Proposal | null;
  txHash: string | null;
  error: string | null;
  propose: (p: Proposal) => void;
  approve: () => Promise<void>;
  cancel: () => void;
} {
  const [state, setState] = useState<SignState>("idle");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const propose = useCallback((p: Proposal) => {
    setTxHash(null);
    if (!isValidAddress(p.to)) {
      setProposal(null);
      setState("blocked");
      setError(`Blocked: "${p.to}" is not a valid 0x address. Fix the destination and propose again.`);
      return;
    }
    try {
      phrsToWeiHex(p.valuePhrs);
    } catch (e) {
      setProposal(null);
      setState("blocked");
      setError(`Blocked: ${e instanceof Error ? e.message : "invalid value."}`);
      return;
    }
    setProposal(p);
    setState("review");
    setError(
      isDustWarning(p.valuePhrs)
        ? `Heads-up: ${p.valuePhrs} PHRS is above the 0.01 dust limit. Double-check the amount before you sign — this is a warning, not a block.`
        : null
    );
  }, []);

  const cancel = useCallback(() => {
    setState("idle");
    setProposal(null);
    setTxHash(null);
    setError(null);
  }, []);

  const approve = useCallback(async () => {
    const p = proposal;
    if (!p || (state !== "review" && state !== "error")) return;
    const eth = window.ethereum;
    if (!eth) {
      setState("error");
      setError("No wallet found in this browser — install one to sign.");
      return;
    }

    // SAFETY LAW 1 — chain check BEFORE anything else. Never proceed on the wrong network.
    const chainId = await currentChainId();
    if (chainId !== ATLANTIC_CHAIN_ID_HEX.toLowerCase()) {
      setState("blocked");
      setError(chainMismatchError());
      return;
    }

    // SAFETY LAW 2 — re-validate everything right before signing.
    if (!isValidAddress(p.to)) {
      setState("blocked");
      setError(`Blocked: "${p.to}" is not a valid 0x address.`);
      return;
    }
    let valueHex: string;
    try {
      valueHex = phrsToWeiHex(p.valuePhrs);
    } catch (e) {
      setState("blocked");
      setError(`Blocked: ${e instanceof Error ? e.message : "invalid value."}`);
      return;
    }

    setError(null);
    setState("awaiting-signature");
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("Your wallet shared no accounts.");

      // SAFETY LAW 3 — the visitor's wallet signs AND sends. We never touch keys.
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: p.to, value: valueHex, data: p.data ?? "0x" }],
      })) as string;
      if (mountedRef.current) setState("broadcasting");

      // SAFETY LAW 4 — poll for the receipt until the chain confirms it.
      const deadline = Date.now() + 120_000;
      let receipt: { status?: string } | null = null;
      while (Date.now() < deadline) {
        if (!mountedRef.current) return;
        const r = (await rpcCall("eth_getTransactionReceipt", [hash])) as {
          status?: string;
        } | null;
        if (r) {
          receipt = r;
          break;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (!mountedRef.current) return;
      if (!receipt) {
        setState("error");
        setError("The transaction was sent but no receipt appeared within 2 minutes — check the explorer for its status.");
        setTxHash(hash);
        return;
      }
      setTxHash(hash);
      if (receipt.status === "0x0") {
        setState("error");
        setError("The transaction was mined but reverted on-chain — no state changed.");
      } else {
        setState("confirmed");
      }
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const code = (e as { code?: number })?.code;
      const msg = e instanceof Error ? e.message : "The wallet call failed.";
      if (code === 4001) {
        setState("error");
        setError("You rejected the signature in your wallet — nothing was sent.");
      } else {
        setState("error");
        setError(msg);
      }
    }
  }, [proposal, state]);

  return { state, proposal, txHash, error, propose, approve, cancel };
}
