import { useCallback, useEffect, useRef, useState } from "react";

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

/**
 * Plain JSON-RPC POST to the Atlantic public RPC — no wallet needed.
 * Throws a plain-language Error on HTTP or RPC-level failure.
 */
export async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(ATLANTIC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
  } catch {
    throw new Error("The Atlantic RPC did not answer — check your connection and retry.");
  }
  if (!res.ok) {
    throw new Error(`The Atlantic RPC returned HTTP ${res.status} — retry in a moment.`);
  }
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message?: string; code?: number };
  };
  if (json.error) {
    throw new Error(
      `Atlantic RPC error: ${json.error.message ?? "unknown error"} (code ${json.error.code ?? "?"})`
    );
  }
  return json.result;
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
  const [intPart, fracPart = ""] = s.split(".");
  const wei = BigInt(intPart) * 10n ** 18n + BigInt((fracPart + "0".repeat(18)).slice(0, 18));
  return "0x" + wei.toString(16);
}

/** True when the amount exceeds the dust threshold — review UI must warn (not block). */
export function isDustWarning(valuePhrs: string): boolean {
  try {
    const s = valuePhrs.trim();
    if (!/^\d+(\.\d{1,18})?$/.test(s)) return false;
    const [intPart, fracPart = ""] = s.split(".");
    const wei = BigInt(intPart) * 10n ** 18n + BigInt((fracPart + "0".repeat(18)).slice(0, 18));
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
