# RPC hardening notes — `useAtlantic.ts` (2026-10-16)

Owner: RPC hardening worker. This file is the record of the T01 HTTP 400
investigation and the `rpcCall` hardening that followed.

## 1. Diagnosis — the founder's HTTP 400 (ROOT CAUSE, verified)

**It was never rate limiting or an intermittent node failure. It was a wrong
method name.**

- T01's try-it-live calls `rpcCall("eth_getBlockNumber", [])` as step 1 of its
  6-call sequence (block number → getCode → 4× eth_call).
- `eth_getBlockNumber` is the **Chain MCP *tool* name, not a JSON-RPC method**.
  The Atlantic gateway (`atlantic.dplabs-internal.com`, `web3_clientVersion` =
  `portal/1.0.0`) rejects it with **HTTP 400** carrying a JSON-RPC error body:
  `{"error":{"code":-32601,"message":"method error; invalid method: eth_getBlockNumber",...}}`.
- The correct JSON-RPC method is **`eth_blockNumber`** → HTTP 200, `0x1e07229…`.
- The old `rpcCall` threw on `!res.ok` **without reading the response body**, so
  the real cause (`-32601 invalid method`) was masked behind the generic
  `"The Atlantic RPC returned HTTP 400 — retry in a moment."` — which is why the
  failure looked like a transient/intermittent 400 instead of a deterministic
  wrong-name bug.
- Two try modules shipped the wrong name: `read-contract-state.tsx` (T01, line
  ~92) and `t13-docs-chain-agent.tsx` (line ~190). T13 was fixed in `5036d39`;
  T01 was notified and is fixing. Every other `rpcCall("…")` in the console
  uses valid JSON-RPC names (`eth_call`, `eth_getBalance`, `eth_getBlockByNumber`,
  `eth_gasPrice`, `eth_getTransactionReceipt`, `eth_getTransactionCount`,
  `eth_getLogs`, `eth_getCode`, `eth_chainId`, `eth_maxPriorityFeePerGas`,
  `eth_getTransactionByHash`, `eth_blockNumber`, `eth_feeHistory`,
  `eth_estimateGas`) — verified by grep across `src/`.

### Reproduction evidence (this VM, 2026-10-16 ~09:40–09:55 EEST)

- **Test A** — exact T01 6-call sequence ×100 iterations: every iteration died
  at call #1 (`eth_getBlockNumber`) with HTTP 400 / `-32601 invalid method`.
  479/480 logged calls were this 400; the 1 other was a single network error.
- **Test B** — 8 parallel full sequences ×10 rounds: same 400 at call #1.
- **Test C** — 200 rapid-fire `eth_getBlockNumber`: all 400.
- **Test D** — 50 concurrent `eth_getBlockNumber` in one burst: all 400.
- **Test E** — 30 iterations with a mobile Safari UA: all 400 (UA irrelevant).
- **Test F** — 10 rounds of two concurrent calls with **identical**
  `id: Date.now()`: all 400 (the id-collision hypothesis is moot — the method
  itself is rejected before id handling matters; ids are now unique anyway,
  `${Date.now()}-${seq}`).
- **Method probe** (curl): `eth_blockNumber`, `eth_chainId`, `net_version`,
  `web3_clientVersion`, `eth_getCode`, `eth_call`, `eth_gasPrice`,
  `eth_getBalance` → all HTTP 200. **Only** `eth_getBlockNumber` → HTTP 400.

Conclusion: from this environment the 400 is **deterministic, not intermittent**.
Why the founder experienced it as intermittent is not fully established — the
masked error message is the main suspect (a bare "HTTP 400" invites a retry
that sometimes "works" when a different code path is hit). The gateway may also
route browser traffic differently; that path was not testable from here.

## 1b. Second RPC behavior data point — receipt lookups can hang (reported, not reproduced here)

T18's agent reports: `cast receipt` (`eth_getTransactionReceipt`) on a
**nonexistent tx hash** hangs with **no response at all** — observed twice,
~120s each, until the subprocess deadline fired. It only surfaces during
receipt lookups for unknown hashes.

Reproduction attempt from this VM (2026-10-16 ~10:00 EEST): a single
`eth_getTransactionReceipt` for the zero hash returned **HTTP 200 with
`result: null` in 1.6s** — no hang. So the hang was **not reproducible from
here**; it may be environment-specific (their subprocess/cast path), route-
specific, or intermittent. Regardless, the implication stands: without a cap,
any RPC call can await forever, so the hardening now includes a per-request
timeout (25s, AbortController) that classifies a stall as a transient
"stopped responding" error and retries it with backoff like any other
transient failure.

## 2. What the hardening does

All in `apps/console/src/hooks/useAtlantic.ts`, `rpcCall` only. Signatures
unchanged (`rpcCall`, `useAtlanticRead`, `useProposeAndSign`, `phrsToWeiHex`,
`isValidAddress`, all constants) — changes are purely additive.

1. **Method-name guard (the actual fix).** `METHOD_ALIASES` maps known-wrong
   names to real JSON-RPC methods at this single choke point:
   `eth_getBlockNumber → eth_blockNumber`. Every try module benefits even if
   its own file still carries the tool name. Add future conflations here, not
   in 28 modules.
2. **Retry with exponential backoff.** HTTP 400/429/5xx and network errors are
   retried: up to 4 attempts, delays 300ms / 900ms / 2700ms + up to 50% jitter.
   **JSON-RPC application errors (`json.error`) are real answers — never
   retried** (e.g. a reverted `eth_call` must surface immediately, not burn
   4 attempts). **Timeouts (25s AbortController cap per request) are treated
   as transient "the RPC stopped responding" errors and retried with the
   same backoff** — no call may await forever (see §1b).
3. **Plain-language error classification.** A raw code is never shown alone:
   429 → "too many requests"; 400 → "the node rejected the request";
   5xx → "the node didn't answer properly". Final failure message pairs the
   meaning with the code, e.g. *"The Atlantic RPC returned the node rejected
   the request (HTTP 400) — still failing after several retries. Wait a moment
   and retry."*
4. **In-flight dedup.** Identical concurrent requests (same method+params)
   share one promise — N parallel try modules firing `eth_blockNumber` issue
   one HTTP request. Entry is removed on settle, so failures are not cached.
5. **`eth_blockNumber` cache (~5s).** Try modules pin one block per run; the
   tip is not refetched for every call within the window. Sequential reads in a
   single flow stay on the same block (a 5s skew is ≤ ~2–3 blocks on this
   chain and only affects the pin, never correctness of the reads).
6. **Collision-proof request ids.** `${Date.now()}-${seq}` instead of bare
   `Date.now()` — two calls in the same millisecond no longer share an id.

Safety: `rpcCall` is read-only in this codebase (writes go through the
visitor's wallet via `useProposeAndSign.approve()`), so all retries are
idempotent. The receipt poller in `approve()` inherits the retry for free.

## 3. Rate-limit findings

- Docs claim **500 requests / 5 minutes**. Verified from this VM with the
  **valid** method: **300 sequential + 40-concurrent burst → 340/340 HTTP 200,
  zero 429s, zero 400s** (~4 min window). Ceiling run: **520 sequential
  `eth_blockNumber` requests over ~5 min → 519 OK, 1 transient network error
  (`fetch failed` at request #263), zero 429s, zero 400s.** The 500/5m limit
  was never triggered from this environment — no throttling observed, so the
  documented ceiling is not contradicted but remains unverified as an actual
  enforcement threshold.
- No `Retry-After` or `X-RateLimit-*` headers were observed on any response.
- At realistic console load (a try-it-live is ~6 calls; even 10 parallel
  visitors are ~60 calls) the limit is not a practical concern — and with
  dedup + the 5s block cache, repeat traffic is far lower than before.
- **The 400 class still needs the retry** (genuine transient 400s from the
  gateway, e.g. malformed params under load, remain possible), but the
  founder's incident was not one of them.

## 4. What remains unknown

- Whether the gateway **ever** aliased `eth_getBlockNumber → eth_blockNumber`
  (which would explain the "intermittent" report if the alias was removed
  recently), or whether browser traffic routes to a different gateway config
  than this VM. Neither was testable from here.
- The exact 500/5m enforcement behavior (sliding vs fixed window, per-IP vs
  global, response headers) — only probed below the ceiling, never triggered.
- Whether the portal gateway applies any method allowlist beyond standard
  JSON-RPC names (all 15 methods used by the console were probed 200 OK).

## 5. For try-module owners

If your module calls `rpcCall("eth_getBlockNumber", …)`, rename it to
`"eth_blockNumber"` — the alias shim keeps you working regardless, but the
source should say the real method name. Do **not** invent other `eth_get*`
names from Chain MCP tool names; when in doubt, probe the method with curl
first: a wrong name returns HTTP 400 with `-32601` in the body.
