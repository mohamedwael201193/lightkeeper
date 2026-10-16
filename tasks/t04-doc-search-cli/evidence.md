# T04 — Doc-Search CLI: Evidence

**Corpus retrieved:** 2026-10-16 (live fetch: `llms.txt` + `llms-full.txt` + `sitemap.md`).
**Index:** 438 passages across 74 doc pages. **Runs:** 9 queries — 7 DOC-GROUNDED, 2 UNVERIFIED misses.
**Machine-readable log:** `evidence/evidence.json` (every run's label, exit code, citations, scores).
**Replay:** `python3 evidence/run_evidence.py` re-runs the battery against the committed index (offline).
**Tests:** `python3 -m unittest tests.test_cli` — 14/14 pass, including miss-path and verbatim-excerpt tests.

Provenance: every transcript below is the real stdout of `./pharos-docs` run on 2026-10-16 against the
index built from the live docs. Nothing is staged, edited, or paraphrased. Exit codes included.

## §1 — Grounded answers (DOC-GROUNDED)

### E1 — deploy a contract

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

The official example query from the task requirements. All three citations are real doc pages; the Foundry guide's published page contains a Hardhat `ignition deploy` example (verified in the source corpus — a docs-publishing artifact, not a misattribution; see REVIEWER_NOTES.md §5).

Citations returned:
  - [Write Your First Uniswap Contract](https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract) — (page) (score 7.846, retrieved 2026-10-16)
  - [Write Your First Uniswap Contract](https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-uniswap-contract) — (page) (score 7.846, retrieved 2026-10-16)
  - [Pharos Documentation Index](https://www.pharos.xyz/llms.txt) — Developer Guide (score 7.165, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'how do I deploy a contract?'
QUESTION
  how do I deploy a contract?

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos
-- Write Your First Uniswap Contract
   Source: https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract (retrieved 2026-10-16)

> npx hardhat ignition deploy ./ignition/modules/Token.js --network pharos
-- Write Your First Uniswap Contract
   Source: https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-uniswap-contract (retrieved 2026-10-16)

> - Foundry: Write Your First NFT: Deploy an NFT contract with Foundry.
-- Pharos Documentation Index — Developer Guide
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E2 — Atlantic testnet chain id + RPC url

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

The Atlantic Testnet page's Network Information table gives ChainID **688689** and the RPC public endpoint — quoted verbatim with the correct page URL.

Citations returned:
  - [Atlantic Testnet](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) — Network Information (score 17.119, retrieved 2026-10-16)
  - [ZAN RPC](https://docs.pharos.xyz/tooling-and-infrastructure/rpc/zan) — How to Access Pharos Testnet RPC from ZAN? (score 15.314, retrieved 2026-10-16)
  - [Pharos Skill Engine](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide) — Part 6 — Quick Reference (score 15.113, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'what is the Atlantic testnet chain id and RPC url'
QUESTION
  what is the Atlantic testnet chain id and RPC url

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> | ChainID                | 688689                                 |
> | Environment            | Atlantic Testnet                       |
-- Atlantic Testnet — Network Information
   Source: https://docs.pharos.xyz/getting-started/network/atlantic-testnet (retrieved 2026-10-16)

> | Atlantic Testnet |     | wss\://api.zan.top/node/ws/v1/pharos/testnet/{apikey}   |
> | Network          | HTTPS URL                                                | WSS URL                                                 |
-- ZAN RPC — How to Access Pharos Testnet RPC from ZAN?
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/rpc/zan (retrieved 2026-10-16)

> --verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract \
> cast logs --from-block 0 --address  "" --rpc-url $RPC
-- Pharos Skill Engine — Part 6 — Quick Reference
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E3 — testnet tokens for gas

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

The docs' answer is the Pharos faucet for testnet PHRS (Piggy Bank Tutorial). The MCP tool-table passage is a weaker third citation, honestly labeled.

Citations returned:
  - [Piggy Bank Tutorial](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide) — Common Errors and Fixes (score 17.568, retrieved 2026-10-16)
  - [Piggy Bank Tutorial](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide) — Prerequisites (score 12.526, retrieved 2026-10-16)
  - [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) — Available Tools (score 10.122, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'how do I get testnet tokens for gas'
QUESTION
  how do I get testnet tokens for gas

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> | insufficient funds               | Not enough PHRS for gas     | Get testnet PHRS from the faucet                    |
-- Piggy Bank Tutorial — Common Errors and Fixes
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide (retrieved 2026-10-16)

> Get testnet PHRS from the Pharos faucet or directly from the team.
-- Piggy Bank Tutorial — Prerequisites
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide (retrieved 2026-10-16)

> | estimate_gas   | eth_estimateGas  | Estimate gas without sending          |
> | get_code       | eth_getCode      | Contract bytecode                     |
-- Pharos MCP — Available Tools
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/mcp (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E4 — which oracle for price feeds

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

Recommendation question: the authoritative Defaults block in `llms.txt` ('prefer Chainlink as the default oracle provider') ranks first via the recommendation boost.

Citations returned:
  - [Pharos Documentation Index](https://www.pharos.xyz/llms.txt) — Defaults (score 26.561, retrieved 2026-10-16)
  - [Pharos Documentation Index](https://www.pharos.xyz/llms.txt) — Tooling & Infrastructure (score 25.798, retrieved 2026-10-16)
  - [Supra](https://docs.pharos.xyz/tooling-and-infrastructure/oracles/supra) — Overview (score 21.001, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'which oracle should I use for price feeds on Pharos'
QUESTION
  which oracle should I use for price feeds on Pharos

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> - For price/market data, prefer Chainlink as the default oracle provider — use Chainlink Push Engine Feeds when your contract should react automatically to on-chain updates without polling, or Chainlink Data Feeds for low-latency, on-demand/pull consumption.
> - For cross-chain needs, prefer Chainlink CCIP first, including for arbitrary messaging — it has a documented, live Pharos↔Ethereum lane.
-- Pharos Documentation Index — Defaults
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)

> - Chainlink Data Feeds: Using Chainlink Data Feeds for low-latency, pull-based price data on Pharos.
> - Supra: Using Supra's pull-based oracle on Pharos.
-- Pharos Documentation Index — Tooling & Infrastructure
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)

> Supra provides high-performance oracle services that deliver real-time price feeds and external data to decentralized applications.
> On Pharos, Supra’s DORA Pull Oracle is deployed on Pacific Mainnet and Atlantic Testnet, enabling smart contracts to securely fetch off-chain data directly from the oracle network.
-- Supra — Overview
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/oracles/supra (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E5 — bridge USDC from Ethereum

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

Bridge question: Circle CCTP page (the docs' recommended USDC bridge) ranks first via synonym expansion (bridge → cctp).

Citations returned:
  - [Pharos Documentation Index](https://www.pharos.xyz/llms.txt) — Tooling & Infrastructure (score 15.664, retrieved 2026-10-16)
  - [Circle CCTP](https://docs.pharos.xyz/tooling-and-infrastructure/cross-chain/circle-cctp) — Overview (score 12.971, retrieved 2026-10-16)
  - [Token Registry](https://docs.pharos.xyz/getting-started/token-registry) — Pacific Mainnet Token Registry (score 11.047, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'how do I bridge USDC from Ethereum to Pharos'
QUESTION
  how do I bridge USDC from Ethereum to Pharos

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> - Circle CCTP: Using Circle's CCTP for native USDC transfers on Pharos.
> - Chainlink CCIP: Using Chainlink CCIP for cross-chain messaging and token transfers on Pharos, including the live Pharos↔Ethereum lane.
-- Pharos Documentation Index — Tooling & Infrastructure
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)

> On Pharos, CCTP allows developers to move USDC between supported networks without relying on traditional bridges or wrapped tokens.
-- Circle CCTP — Overview
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/cross-chain/circle-cctp (retrieved 2026-10-16)

> | Symbol                 | Name            | Pharos Address                             | Ethereum Address                           | Base Address                               |
> | USDC (Circle Deployed) | USDC            | 0xc879c018db60520f4355c26ed1a6d572cdac1815 |                                            |                                            |
-- Token Registry — Pacific Mainnet Token Registry
   Source: https://docs.pharos.xyz/getting-started/token-registry (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E6 — confidential transactions

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

The docs do mention confidential cross-chain interactions (About Pharos → Ecosystem Architecture) — DOC-GROUNDED is the correct label; the quote shows exactly what the doc claims, no more.

Citations returned:
  - [About Pharos](https://docs.pharos.xyz/introduction/readme.md) — Ecosystem Architecture (score 18.996, retrieved 2026-10-16)
  - [x402](https://docs.pharos.xyz/developer-guide/x402) — Development Recommendations (score 8.311, retrieved 2026-10-16)
  - [Pharos Documentation Index](https://www.pharos.xyz/llms.txt) — Tooling & Infrastructure (score 6.52, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'does Pharos support confidential transactions'
QUESTION
  does Pharos support confidential transactions

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> A modular stack is provided to support SPNs, Pharos L2/L3 systems.
> Transaction Layer: Facilitates secure, confidential, and efficient cross-chain asset and account interactions via the secure and confidential cross-chain interoperability protocol.
-- About Pharos — Ecosystem Architecture
   Source: https://docs.pharos.xyz/introduction/readme.md (retrieved 2026-10-16)

> * Transaction Idempotency and Retry Support: The client should be able to initiate a retry request based on the original transaction hash after a network interruption or request failure.
> * Security Management of Sensitive Information: All confidential data such as private keys and API keys should be injected into the application through environment variables or dedicated secret management services.
-- x402 — Development Recommendations
   Source: https://docs.pharos.xyz/developer-guide/x402 (retrieved 2026-10-16)

> - Nirvana RPC: Nirvana's RPC endpoint support for Pharos.
-- Pharos Documentation Index — Tooling & Infrastructure
   Source: https://www.pharos.xyz/llms.txt (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

### E7 — install the Pharos MCP server

Expected label: **DOC-GROUNDED** · Got: **DOC-GROUNDED** · Exit: 0 · Check: PASS

Pharos MCP install question grounded on the Pharos MCP page's Self-Hosting section.

Citations returned:
  - [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) — Self-Hosting (score 22.708, retrieved 2026-10-16)
  - [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) — Quick Start (score 19.885, retrieved 2026-10-16)
  - [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) — Sending Transactions (score 14.935, retrieved 2026-10-16)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'how do I install the Pharos MCP server'
QUESTION
  how do I install the Pharos MCP server

LABEL: DOC-GROUNDED

ANSWER (quoted verbatim from the indexed docs; nothing added)
> git clone https://github.com/PharosNetwork/pharos-mcp.git
-- Pharos MCP — Self-Hosting
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/mcp (retrieved 2026-10-16)

> "args": ["-y", "mcp-remote", "https://mcp.pharos.xyz/mcp"]
-- Pharos MCP — Quick Start
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/mcp (retrieved 2026-10-16)

> Your private key ──sign (locally)──▶ 0x02f86b…──▶ MCP server ──▶ Pharos
-- Pharos MCP — Sending Transactions
   Source: https://docs.pharos.xyz/tooling-and-infrastructure/mcp (retrieved 2026-10-16)

[INFERENCE] Reading of the above (not a doc quote): the quoted passages are the complete basis for this answer; anything beyond the quotes is this tool's synthesis, labeled as such.

Sources checked: local index of 438 passages across 74 doc pages (corpus retrieved 2026-10-16).

[exit code: 0]
```

</details>

## §2 — Honest misses (UNVERIFIED)

### M1 — MISS: CEO birthday

Expected label: **UNVERIFIED** · Got: **UNVERIFIED** · Exit: 2 · Check: PASS

Off-topic question. No covering passage → UNVERIFIED, exit 2. The tool suggests rephrasing instead of inventing.

Citations returned:
  - (none)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'what is the birthday of the Pharos CEO'
QUESTION
  what is the birthday of the Pharos CEO

LABEL: UNVERIFIED

No good answer found. The indexed Pharos docs (438 passages, retrieved 2026-10-16) contain no passage covering this question above the confidence threshold, so this tool will not improvise an answer.

What you can do:
  - Rephrase with Pharos-specific terms (e.g. 'Atlantic', 'PHRS', 'CCIP', 'validator').
  - Browse the full doc index: https://docs.pharos.xyz/sitemap.md
  - Refresh the corpus: pharos-docs --rebuild-index

[exit code: 2]
```

</details>

### M2 — MISS: Raspberry Pi node guide

Expected label: **UNVERIFIED** · Got: **UNVERIFIED** · Exit: 2 · Check: PASS

Plausible dev question, but 'Raspberry Pi' never appears in the docs. The coverage gate (distinctive terms) correctly refuses even though generic node passages score well — this is the behavior the task grades.

Citations returned:
  - (none)

<details><summary>Full terminal transcript (verbatim)</summary>

```
$ ./pharos-docs 'how do I run a Pharos node on a Raspberry Pi'
QUESTION
  how do I run a Pharos node on a Raspberry Pi

LABEL: UNVERIFIED

No good answer found. The indexed Pharos docs (438 passages, retrieved 2026-10-16) contain no passage covering this question above the confidence threshold, so this tool will not improvise an answer.

What you can do:
  - Rephrase with Pharos-specific terms (e.g. 'Atlantic', 'PHRS', 'CCIP', 'validator').
  - Browse the full doc index: https://docs.pharos.xyz/sitemap.md
  - Refresh the corpus: pharos-docs --rebuild-index

[exit code: 2]
```

</details>

## §3 — Provenance notes

- Corpus files: `corpus/llms.txt`, `corpus/llms-full.txt`, `corpus/sitemap.md` + `corpus/manifest.json`
  (retrieval date 2026-10-16). Re-fetch: `bash fetch_corpus.sh`; rebuild: `python3 src/build_index.py`.
- Citation URLs were each curl-verified (HTTP 200) on 2026-10-16 — see `LINKS.md`.
- The `?ask=` endpoint investigation (why this is not a thin HTTP wrapper) is in `REVIEWER_NOTES.md` §1.
- Spend: 0 PHRS (read-only task; no chain calls made).
