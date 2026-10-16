# T27 — Reviewer Notes

## 30-second test

```bash
cd ~/workspace/lightkeeper/tasks/t27-doc-grounded-builder-agent
python3 src/agent.py --request "make my token confidential with private shielded transactions" --mode plan
# → REFUSED with say-so, uncovered terms named. The coverage gate is the product.
python3 -m pytest tests/ -q   # 6 passed
```

Then check the live proof: https://atlantic.pharosscan.xyz/tx/0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379

## Judgment calls (flagged, not buried)

1. **Docs MCP vs local corpus.** The official requirement says "Uses Docs MCP to PLAN". The Docs MCP `?ask=` endpoint 403s plain GETs (verified first-hand 2026-10-16; LIGHTKEEPER-VERDICT.md P14). The verdict's honest design for T04/T27 is a local crawl of `llms.txt` + `.md` pages with local retrieval — that is what this build does, with URL+date+excerpt citations. No citation schema was invented; page URL + excerpt is the citation unit, exactly as the verdict prescribes.

2. **"Executes for real" vs "funds prepared-for-signature only".** The T27-specific build order says the covered plan executes for real (deploy ERC-20 + verify). The official requirement (2) says anything moving funds is prepared-for-signature only. Mapping used: **build/deployment steps** (contract deploy + verify, the campaign-ordered live build) execute for real; the **funds-moving request** (R3 transfer) is prepared-for-signature — the doc covers the broadcast, the requirement overrides execution mode, and the agent says so in the step note (`POLICY_BLOCKED`, not a silent skip). The unsigned tx is real data (live calldata, gas estimate, nonce), not a mock.

3. **`forge script --broadcast` → `cast send --create` substitution.** The doc's deploy command is RPC-incompatible on Atlantic (proven, not assumed — proxy capture in `run-logs/`). The fallback is the skill-documented deployment path (`pharos-skill-engine/references/contract.md`, "Deploy via Compiled Bytecode"), same Foundry toolchain family. Logged as INFERENCE in the execution record. If the RPC is ever fixed, the agent's primary path is still the doc's command.

4. **R3 is a transfer, not an approve.** The campaign sketch suggested "approve prepared-for-signature"; the doc's InteractToken passage covers `transfer` (not `approve`), so the covered plan uses transfer — coverage purity over sketch fidelity.

## What could be stronger

- Retrieval is keyword-based over 5 pages; a larger corpus + embeddings would widen the covered surface (more request types pass the gate honestly).
- The planner library is pattern-based (3 request types). A generalizer that drafts plans from retrieved passages for arbitrary requests — with the same gate — is the natural v2.
- No video yet (slot PENDING-VIDEO); VIDEO-GUIDE.md is the shot plan.

## Reproducibility

- Corpus pinned with fetch date in `corpus/doc_provenance.json`; citations carry retrieval timestamps.
- `foundry/` builds deterministically (`forge build` clean, `forge test` 1/1).
- Every broadcast wrapped in `flock /tmp/lk-nonce.lock` (28 workers, one key).
- Spend: 0.00094 / 0.15 PHRS. Secrets: env-only, redacted from logs, none in repo.
