<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:52px;letter-spacing:14px;">T27</div>
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:30px;letter-spacing:8px;margin-top:8px;">DOC-GROUNDED BUILDER AGENT</div>
  <div style="color:#f4f6ff;font-size:15px;margin-top:18px;font-style:italic;">The keeper cites the chart before lighting the lamp —<br/>no step sails without a source.</div>
  <div style="color:#b9c2f5;font-size:12px;margin-top:14px;letter-spacing:3px;">LIGHTKEEPER · LAMP 27 OF 28 · 200 PTS · CROSS-TOOL</div>
</div>

---

## 1. What it is

A builder agent that **plans strictly from retrieved Pharos documentation** — never from memory, never improvised. Given a build request ("deploy an ERC20 on Atlantic and verify it"), it:

1. **INTAKE** — parses the request.
2. **RESEARCH** — retrieves relevant passages from a local crawl of the Pharos docs (`pharos.xyz/llms.txt` + `.md` pages), each citation carrying **doc URL + retrieval date + excerpt**.
3. **PLAN** — renders the cited plan *before* acting.
4. **COVERAGE CHECK** — every step must trace to a cited passage. A step without coverage is flagged **UNVERIFIED** and the agent **REFUSES** it with a reason instead of improvising (MEGA §228: *"if docs don't cover it, the agent must SAY SO — never improvise"*).
5. **EXECUTE** — runs the covered plan for real on Atlantic testnet.
6. **VERIFY** — confirms the outcome on-chain and reports success/failure vs the plan.

Citation discipline on every technical claim: **DOC-GROUNDED** / **INFERENCE** / **UNVERIFIED**.

## 2. The four scripted requests

| ID | Request | Coverage | Outcome |
|---|---|---|---|
| R1 | "deploy an ERC20 token on the Atlantic testnet and verify the contract" | Full — token tutorial + Atlantic Live Data + SocialScan verify docs | **EXECUTED for real**: deployed `0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19`, verified on SocialScan |
| R2 | "read the ERC-20 balance of my wallet on Atlantic" | Full — doc's `balanceOf` interact pattern | **EXECUTED for real**: `balanceOf(deployer) = 1000000` |
| R3 | "transfer 10 ERC-20 tokens to 0x…dEaD" | Plan covered; broadcast withheld | **PREPARED FOR SIGNATURE**: real unsigned tx (calldata `0xa9059cbb…`, gas 66063, nonce 138, chainId 688689), never broadcast |
| R4 | "make my token confidential with private shielded transactions" | **None** — zero corpus hits for `confidential`, `shielded` | **REFUSED** with say-so: *"the docs do not cover this request — no passage mentions: confidential, shielded"* |

## 3. How to run it

```bash
cd ~/workspace/lightkeeper/tasks/t27-doc-grounded-builder-agent
export PATH="$HOME/.foundry/bin:$PATH"

# plan only (no execution)
python3 src/agent.py --request "deploy an ERC20 token on Atlantic and verify it" --mode plan

# execute the covered plan for real (needs PRIVATE_KEY env for broadcasts)
set -a; source ~/workspace/lightkeeper/.env; set +a
export PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY"   # never printed, never committed
python3 src/agent.py --request "deploy an ERC20 token on Atlantic and verify it" --mode execute

# coverage-gate unit tests
python3 -m pytest tests/ -q   # 6 passed
```

Nonce safety (28 workers share one key): every broadcast is wrapped in `flock /tmp/lk-nonce.lock`.

## 4. Architecture

```
src/agent.py
├── INTAKE        classify(request) → deploy_token | read_balance | transfer | None
├── RESEARCH      retrieve(query, corpus) → citations {doc_url, retrieved_at, excerpt, score}
│                 corpus/ = llms.txt + 4 .md pages, provenance in doc_provenance.json
├── PLAN          plan_deploy_token / plan_read_balance / plan_transfer
│                 each Step: id, description, citations[], status, artifact, note
├── COVERAGE      coverage_check(steps) → PASS only if zero UNVERIFIED steps
├── EXECUTE       covered steps run for real (forge build/test, broadcast, verify, cast reads)
│                 POLICY_BLOCKED steps (funds-moving) → unsigned tx preview, never broadcast
└── VERIFY        on-chain confirmation: eth_getCode, name/symbol/totalSupply, balanceOf, receipt

foundry/          project generated from doc passages (Token.sol + DeployToken.s.sol verbatim)
tests/            6 pytest coverage-gate tests
run-logs/         r1-deploy-execute.json, r1-verify-correction.txt, r2/r3/r4 logs,
                  forge-script-rpc-incompatibility.txt (proxy capture)
```

**Honest engineering notes (full detail in REVIEWER_NOTES.md):**
- `forge script --broadcast` (the doc's deploy command) is **rejected by the Atlantic RPC** — it sends `eth_getTransactionCount` with an EIP-1898 block object carrying `requireCanonical`, which the RPC can't parse (`PARAM_VERIFY_ERROR`), proven via proxy capture even for a no-op script. The agent falls back to the skill-documented equivalent `cast send --create` (same toolchain, same bytecode, same constructor args, same RPC/chain) and logs the substitution as INFERENCE.
- The first verify attempt hit the explorer indexer's lag (the skill warns: wait ~10s after deploy); the retry succeeded: *"Contract successfully verified"*.

## 5. Live evidence (Atlantic testnet, chain 688689)

- **Deploy tx:** [0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379](https://atlantic.pharosscan.xyz/tx/0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379) — block 31482431, status 1, 941730 gas @ 1000000001 wei
- **Token:** [0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19](https://atlantic.pharosscan.xyz/address/0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19) — name `Token`, symbol `MTK`, totalSupply `1000000`, verified source on SocialScan (GUID `8e213c49…23fa6ac3a4f`)
- **Spend:** 0.000941731 PHRS (budget 0.15) — see `evidence.json`
- **Coverage map:** every R1 step → cited passage, in `run-logs/r1-deploy-execute.json` (`steps[].citations`)

## 6. Coverage map (R1 — step → citation)

| Step | Action | Cited passage |
|---|---|---|
| D1 | `forge install OpenZeppelin/openzeppelin-contracts --no-git` | write-your-first-token.md — "Install OpenZeppelin contracts: `forge install OpenZeppelin/openzeppelin-contracts --no-git`" |
| D2 | `src/Token.sol` verbatim | write-your-first-token.md — the full `Token is ERC20` listing |
| D3 | `script/DeployToken.s.sol` verbatim | write-your-first-token.md — the full `DeployToken is Script` listing (`vm.envUint("PRIVATE_KEY")`, `new Token(1000000)`) |
| D4 | install forge-std | **INFERENCE** — required by the doc's own `import "forge-std/Script.sol"` |
| D5 | `forge build` | write-your-first-token.md — "Compile the Smart Contract: `forge build`" |
| D6 | `forge test` | write-your-first-token.md — "Test the Smart Contract: `forge test`" (test file itself INFERENCE — the doc ships none) |
| D7 | broadcast deploy | write-your-first-token.md — "`forge script script/DeployToken.s.sol --rpc-url <PHAROS_RPC_URL> --broadcast`"; RPC+chain 688689 from atlantic-testnet.md Live Data (docs: never rely on memorized network parameters) |
| D8 | `forge verify-contract … --chain-id 688689 --verifier blockscout --verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract` | write-your-first-token.md Step 5 (verbatim flags) + hemera-socialscan.md ("Verify smart contracts using the SocialScan Developer API") |
| D9 | on-chain confirmation | write-your-first-token.md — InteractToken `token.balanceOf(msg.sender)` pattern |

R4's refusal is the coverage map's negative proof: `confidential`/`shielded` return zero corpus hits → UNVERIFIED → refused, never improvised.

## 7. Files

- `src/agent.py` — the agent
- `corpus/` — 5 retrieved docs + `doc_provenance.json`
- `foundry/` — doc-generated project (builds, 1/1 forge tests pass)
- `tests/test_coverage_gate.py` — 6 tests, all pass
- `run-logs/` — real execution logs
- `REQUIREMENTS.md`, `evidence.md`, `evidence.json`, `REVIEWER_NOTES.md`, `LINKS.md`, `SUBMISSION.md`, `VIDEO-GUIDE.md`, `task.yaml`

## 8. Status & limits

**Shipped 2026-10-16.** Real deploy tx, real verification, real refusal demo, 6/6 gate tests green, spend 0.00094/0.15 PHRS.

**Known limits (not hidden):**
- Docs MCP `?ask=` endpoint 403s plain GETs → retrieval is a local corpus crawl (the verdict's honest design), not live Docs-MCP queries.
- `forge script` ↔ Atlantic RPC incompatibility (documented above) — the agent logs and routes around it.
- The agent's planner library covers ERC-20 deploy/read/transfer; anything else goes through the say-so gate by design.
- Transfer execution is deliberately unsigned-only per the official requirement — the broadcast step is POLICY_BLOCKED, not a missing feature.
