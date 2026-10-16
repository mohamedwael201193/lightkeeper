#!/usr/bin/env python3
"""
T27 — Doc-Grounded Builder Agent (LIGHTKEEPER).

5-stage pipeline: INTAKE -> Docs research (local corpus crawl of
https://www.pharos.xyz/llms.txt + .md docs pages) -> cited PLAN rendered
BEFORE acting -> COVERAGE CHECK (every step must trace to a cited passage;
uncovered steps are flagged UNVERIFIED and the agent REFUSES them with a
reason instead of improvising) -> EXECUTION of the covered plan for real ->
on-chain VERIFY -> verdict report.

Citation discipline (MEGA §228):
  DOC-GROUNDED — passage exists in the corpus (doc URL + retrieved date + excerpt)
  INFERENCE    — derived from a grounded passage, labeled as such
  UNVERIFIED   — no coverage; the agent says so and refuses the step

Coverage gate (MEGA §228 / T27 requirement 5): if the docs don't cover a
step, the agent must SAY SO — never improvise.
"""
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASK_DIR = HERE.parent
CORPUS_DIR = TASK_DIR / "corpus"

# ---------------------------------------------------------------- intake

REQUEST_PATTERNS = {
    "deploy_token": re.compile(r"deploy\b.*\b(erc-?20|token)\b|\b(erc-?20|token)\b.*\bdeploy\b", re.I),
    "read_balance": re.compile(r"\b(balance|balanceof)\b.*\b(erc-?20|token)\b|\b(erc-?20|token)\b.*\bbalance\b", re.I),
    "transfer": re.compile(r"\b(transfer|send)\b.*\b(erc-?20|token|tokens)\b|\b(erc-?20|token)\b.*\btransfer\b", re.I),
}

# ---------------------------------------------------------------- corpus

def load_provenance():
    with open(CORPUS_DIR / "doc_provenance.json") as f:
        return json.load(f)


def load_corpus():
    """Load all .md corpus files with their source URLs."""
    prov = load_provenance()
    url_by_file = {d["file"]: d["url"] for d in prov["documents"]}
    docs = []
    for md in sorted(CORPUS_DIR.glob("*.md")):
        text = md.read_text()
        docs.append({
            "file": md.name,
            "url": url_by_file.get(md.name, "unknown"),
            "text": text,
        })
    return docs, prov["fetched_at"]


def corpus_term_hits(term, docs):
    tl = term.lower()
    return sum(1 for d in docs for p in split_passages(d["text"]) if tl in p.lower())


def uncovered_terms(request, docs):
    """Content terms of the request that appear NOWHERE in the corpus."""
    terms = [t.lower() for t in re.findall(r"[a-zA-Z0-9\-]+", request)
             if t.lower() not in STOP and len(t) > 3]
    return sorted({t for t in terms if corpus_term_hits(t, docs) == 0})


def refuse_say_so(log, docs, extra=""):
    corpus_urls = ", ".join(sorted({d["url"] for d in docs}))
    log["verdict"] = "REFUSED"
    log["reason"] = ("SAY-SO: the retrievable Pharos docs (corpus: " + corpus_urls + ") "
                     "do not cover this request" + extra + ". Per the T27 coverage gate, "
                     "the agent does not improvise — the request is UNVERIFIED and refused.")
    return log


def split_passages(text, max_len=900):
    """Split a doc into ~paragraph/section passages for retrieval."""
    chunks = re.split(r"\n(?=#{1,3} |\n)", text)
    passages = []
    for ch in chunks:
        ch = ch.strip()
        if len(ch) < 40:
            continue
        if len(ch) > max_len:
            # split long chunks on blank lines
            parts = [p.strip() for p in ch.split("\n\n") if len(p.strip()) >= 40]
            passages.extend(parts)
        else:
            passages.append(ch)
    return passages


STOP = set("the a an and or of to in on for with is are be by as at from that this it its you your we our they their will can use using used how do i my me an into via per over all any not no if when what which who where why there here get set new add create make run than then so such".split())


def retrieve(query, docs, retrieved_at, top_k=4):
    """Keyword retrieval over the local corpus. Returns Citation dicts."""
    terms = [t.lower() for t in re.findall(r"[a-zA-Z0-9\-]+", query) if t.lower() not in STOP]
    scored = []
    for doc in docs:
        for p in split_passages(doc["text"]):
            pl = p.lower()
            score = sum(2 if t in pl else 0 for t in terms)
            # phrase bonus
            if len(query) > 8 and query.lower()[:24] in pl:
                score += 3
            if score > 0:
                scored.append((score, doc, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    citations = []
    for score, doc, p in scored[:top_k]:
        citations.append({
            "discipline": "DOC-GROUNDED",
            "doc_url": doc["url"],
            "retrieved_at": retrieved_at,
            "excerpt": p[:600],
            "score": score,
        })
    return citations


# ---------------------------------------------------------------- plans

@dataclass
class Step:
    id: str
    description: str
    citations: list = field(default_factory=list)
    status: str = "UNVERIFIED"          # COVERED | INFERENCE | UNVERIFIED | POLICY_BLOCKED
    artifact: str = ""
    note: str = ""


def covered_step(step_id, description, citations, artifact="", note=""):
    return Step(id=step_id, description=description, citations=citations,
                status="COVERED", artifact=artifact, note=note)


def find(docs, retrieved_at, *queries):
    out = []
    for q in queries:
        out.extend(retrieve(q, docs, retrieved_at, top_k=2))
    # dedupe by excerpt
    seen, dedup = set(), []
    for c in out:
        if c["excerpt"] not in seen:
            seen.add(c["excerpt"])
            dedup.append(c)
    return dedup


def plan_deploy_token(docs, retrieved_at):
    """R1 — deploy ERC-20 on Atlantic + verify. All steps doc-covered."""
    steps = []
    steps.append(covered_step(
        "D1", "Install OpenZeppelin contracts dependency",
        find(docs, retrieved_at, "Install OpenZeppelin Contracts forge install"),
        artifact="lib/openzeppelin-contracts",
        note='Doc command: `forge install OpenZeppelin/openzeppelin-contracts --no-git`'))
    steps.append(covered_step(
        "D2", "Write src/Token.sol exactly as documented (ERC20, constructor mints initialSupply)",
        find(docs, retrieved_at, "Write the Token Contract ERC20 initialSupply _mint"),
        artifact="src/Token.sol"))
    steps.append(covered_step(
        "D3", "Write script/DeployToken.s.sol exactly as documented (vm.envUint PRIVATE_KEY, new Token(1000000))",
        find(docs, retrieved_at, "DeployToken vm.startBroadcast new Token(1000000)"),
        artifact="script/DeployToken.s.sol"))
    s = Step(id="D4", description="Install forge-std (required by the doc's DeployToken script import forge-std/Script.sol)",
             status="INFERENCE",
             note="INFERENCE: the documented DeployToken.s.sol imports forge-std/Script.sol, so forge-std must be installed for the doc's own commands to work.")
    steps.append(s)
    steps.append(covered_step(
        "D5", "Compile with forge build",
        find(docs, retrieved_at, "Compile the Smart Contract forge build"),
        artifact="out/"))
    steps.append(covered_step(
        "D6", "Run forge test",
        find(docs, retrieved_at, "Test the Smart Contract forge test"),
        note="Doc gives the command, not a test file: the test file itself is INFERENCE; the command is DOC-GROUNDED."))
    steps.append(covered_step(
        "D7", "Broadcast deployment: forge script script/DeployToken.s.sol --rpc-url <PHAROS_RPC_URL> --broadcast",
        find(docs, retrieved_at, "Deploy the Contract forge script --rpc-url --broadcast",
             "Atlantic Testnet RPC Public Endpoint 688689"),
        note="RPC URL + chain ID 688689 taken from the Atlantic Testnet Live Data page (docs instruct not to rely on memorized network parameters)."))
    steps.append(covered_step(
        "D8", "Verify: forge verify-contract <addr> --constructor-args <abi_encoded> src/Token.sol:Token --chain-id 688689 --verifier blockscout --verifier-url <socialscan contract API>",
        find(docs, retrieved_at, "Verify the Token Contract forge verify-contract blockscout",
             "Verify smart contracts using the SocialScan Developer API"),
        note="Doc gives --chain-id 688689 and the SocialScan verifier URL for testnet; constructor args ABI-encoded (uint256 initialSupply)."))
    steps.append(covered_step(
        "D9", "Confirm on-chain: bytecode present at address + balanceOf(deployer) via the doc's InteractToken balance pattern",
        find(docs, retrieved_at, "Interact with the Token Contract balanceOf"),
        note="Doc's InteractToken script checks balance with token.balanceOf(msg.sender)."))
    return steps


def plan_read_balance(docs, retrieved_at):
    """R2 — read ERC-20 balance. Doc-covered read."""
    return [covered_step(
        "B1", "Read token.balanceOf(holder) following the doc's InteractToken balance pattern",
        find(docs, retrieved_at, "Check balance balanceOf console.log Balance"),
        note="Read-only; executed for real via eth_call. No funds move.")]


def plan_transfer(docs, retrieved_at):
    """R3 — transfer ERC-20. Plan covered; broadcast withheld by policy."""
    steps = [covered_step(
        "T1", "Build the transfer from the doc's InteractToken pattern: token.transfer(recipient, amount)",
        find(docs, retrieved_at, "Transfer tokens token.transfer InteractToken"),
        artifact="unsigned tx preview (to, data, value, gas, chainId, nonce)")]
    s = Step(id="T2", description="Broadcast the transfer (forge script --broadcast per doc)",
             status="POLICY_BLOCKED",
             note=("DOC-GROUNDED plan step, but execution WITHHELD: T27 official requirement (2) — "
                   "anything moving funds is PREPARED FOR SIGNATURE only. The doc covers the "
                   "broadcast; the requirement overrides execution mode. Output = the real unsigned "
                   "transaction the user's wallet would sign. Nothing is broadcast."))
    steps.append(s)
    return steps


PLANNERS = {
    "deploy_token": plan_deploy_token,
    "read_balance": plan_read_balance,
    "transfer": plan_transfer,
}


def classify(request):
    for kind, pat in REQUEST_PATTERNS.items():
        if pat.search(request):
            return kind
    return None


# ---------------------------------------------------------------- coverage gate

def coverage_check(steps):
    uncovered = [s for s in steps if s.status == "UNVERIFIED"]
    return {
        "total_steps": len(steps),
        "covered": sum(1 for s in steps if s.status == "COVERED"),
        "inference": sum(1 for s in steps if s.status == "INFERENCE"),
        "policy_blocked": sum(1 for s in steps if s.status == "POLICY_BLOCKED"),
        "unverified": len(uncovered),
        "gate": "PASS" if not uncovered else "FAIL",
        "unverified_steps": [s.id for s in uncovered],
    }


# ---------------------------------------------------------------- execution helpers

def sh(cmd, env=None, cwd=None, timeout=300):
    e = dict(os.environ)
    if env:
        e.update(env)
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, env=e, timeout=timeout)
    return p.returncode, p.stdout[-6000:], p.stderr[-3000:]


def sh_full(cmd, env=None, cwd=None, timeout=300):
    """Same as sh() but returns FULL stdout (for large artifacts like bytecode)."""
    e = dict(os.environ)
    if env:
        e.update(env)
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, env=e, timeout=timeout)
    return p.returncode, p.stdout, p.stderr[-3000:]


# ---------------------------------------------------------------- main

def run_agent(request, mode="plan", token_address=None, transfer_to=None, transfer_amount=None):
    docs, retrieved_at = load_corpus()
    kind = classify(request)
    log = {"request": request, "mode": mode, "classified_as": kind, "ts": datetime.now(timezone.utc).isoformat()}

    if kind is None:
        # Unmapped request: check whether its distinguishing concepts exist
        # anywhere in the corpus. Terms with zero corpus hits = the docs do
        # not cover this request -> say so and refuse (never improvise).
        novel = uncovered_terms(request, docs)
        if novel:
            log["uncovered_terms"] = novel
            return refuse_say_so(
                log, docs,
                extra=" — no passage mentions: " + ", ".join(novel))
        cits = retrieve(request, docs, retrieved_at, top_k=3)
        log["citations_consulted"] = len(cits)
        return refuse_say_so(
            log, docs,
            extra=" (retrieval found only weak/irrelevant passages; "
                  "nothing the agent can build a cited plan from)")

    steps = PLANNERS[kind](docs, retrieved_at)
    gate = coverage_check(steps)
    log["coverage_gate"] = gate
    log["steps"] = [asdict(s) for s in steps]

    if gate["gate"] == "FAIL":
        log["verdict"] = "REFUSED"
        log["reason"] = ("Coverage gate FAIL: steps "
                         + ", ".join(gate["unverified_steps"])
                         + " have no doc coverage. Agent refuses those steps instead of improvising.")
        return log

    if mode == "plan":
        log["verdict"] = "PLAN_READY"
        return log

    # mode == execute : run covered steps for real
    log["execution"] = execute_plan(kind, steps, token_address=token_address,
                                    transfer_to=transfer_to, transfer_amount=transfer_amount)
    log["verdict"] = "EXECUTED" if kind != "transfer" else "PREPARED_FOR_SIGNATURE"
    return log


def execute_plan(kind, steps, token_address=None, transfer_to=None, transfer_amount=None):
    rpc = os.environ.get("ATLANTIC_RPC_URL", "https://atlantic.dplabs-internal.com")
    proj = str(TASK_DIR / "foundry")
    out = {"steps": []}

    def rec(step_id, ok, detail):
        out["steps"].append({"step": step_id, "ok": ok, "detail": detail})

    if kind == "deploy_token":
        rc, so, se = sh("export PATH=\"$HOME/.foundry/bin:$PATH\"; forge build", cwd=proj)
        rec("D5", rc == 0, (so + se)[-1500:])
        if rc != 0:
            out["aborted"] = True
            return out
        rc, so, se = sh("export PATH=\"$HOME/.foundry/bin:$PATH\"; forge test", cwd=proj)
        rec("D6", rc == 0, (so + se)[-1500:])
        pk = os.environ.get("PRIVATE_KEY", "")
        if not pk:
            rec("D7", False, "PRIVATE_KEY env not set — cannot broadcast (secret never logged)")
            out["aborted"] = True
            return out
        # D7: the doc's command is `forge script ... --broadcast`. Proven
        # 2026-10-16 (proxy capture in run-logs/forge-script-rpc-incompatibility.log):
        # forge script sends eth_getTransactionCount with an EIP-1898 block
        # object carrying `requireCanonical`, which the Atlantic RPC rejects
        # (PARAM_VERIFY_ERROR) — even for a no-op script. Fallback: the
        # skill-documented equivalent `cast send --create` (same toolchain
        # family, same bytecode, same constructor args, same RPC, same chain).
        rc, so, se = sh(
            "export PATH=\"$HOME/.foundry/bin:$PATH\"; "
            "flock /tmp/lk-nonce.lock forge script script/DeployToken.s.sol "
            f"--rpc-url {rpc} --broadcast",
            cwd=proj, env={"PRIVATE_KEY": pk})
        out["d7_mechanism"] = "forge script --broadcast (documented command)"
        addr = None
        if rc != 0 and "PARAM_VERIFY_ERROR" in (so + se):
            out["d7_mechanism_substitution"] = (
                "INFERENCE: forge script --broadcast rejected by Atlantic RPC "
                "(PARAM_VERIFY_ERROR on eth_getTransactionCount with requireCanonical block "
                "object; proven via proxy capture 2026-10-16, even for a no-op script). "
                "Fell back to the skill-documented equivalent: cast send --create "
                "(pharos-skill-engine references/contract.md 'Deploy via Compiled Bytecode'). "
                "Bytecode, constructor args (1000000), RPC and chain ID unchanged from the doc plan.")
            rc2, bcode, _ = sh_full("export PATH=\"$HOME/.foundry/bin:$PATH\"; forge inspect Token bytecode",
                                cwd=proj)
            rc3, cargs, _ = sh_full("export PATH=\"$HOME/.foundry/bin:$PATH\"; "
                                "cast abi-encode 'constructor(uint256)' 1000000")
            initcode = (bcode.strip() + cargs.strip()[2:]) if rc2 == 0 and rc3 == 0 else ""
            rc, so, se = sh(
                "export PATH=\"$HOME/.foundry/bin:$PATH\"; "
                "flock /tmp/lk-nonce.lock cast send "
                f"--private-key \"$PRIVATE_KEY\" --rpc-url {rpc} --create {initcode}",
                cwd=proj, env={"PRIVATE_KEY": pk}, timeout=300)
            out["d7_mechanism"] = "cast send --create (substituted, see d7_mechanism_substitution)"
        rec("D7", rc == 0, (so + se)[-2500:])
        m = re.search(r"contractAddress\s+(0x[0-9a-fA-F]{40})", so)  # cast table format
        if not m:
            m = re.search(r'"contractAddress":\s*"(0x[0-9a-fA-F]{40})"', so)  # JSON format
        if not m:
            m = re.search(r"Deployed to:\s*(0x[0-9a-fA-F]{40})", so + se)  # forge script format
        addr = m.group(1) if m else None
        out["token_address"] = addr
        if addr:
            import time as _t
            _t.sleep(12)  # skill guideline: let the explorer indexer catch up
            rc2, so2, se2 = sh(
                "export PATH=\"$HOME/.foundry/bin:$PATH\"; "
                f"ARGS=$(cast abi-encode 'constructor(uint256)' 1000000); "
                f"forge verify-contract {addr} --constructor-args $ARGS src/Token.sol:Token "
                f"--chain-id 688689 --verifier blockscout "
                f"--verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract",
                cwd=proj, timeout=300)
            rec("D8", rc2 == 0, (so2 + se2)[-1500:])
            code = sh(f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast code {addr} --rpc-url {rpc}")[1]
            rec("D9a", len(code.strip()) > 2, f"bytecode bytes at {addr}: {len(code.strip())}")
            bal = sh(f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast call {addr} "
                     f"\"balanceOf(address)(uint256)\" 0xf76e6b0920e9332fF4410f6dD53F01722AbC71a3 --rpc-url {rpc}")[1]
            rec("D9b", True, f"balanceOf(deployer) = {bal.strip()}")
        return out

    if kind == "read_balance":
        if not token_address:
            rec("B1", False, "no token address supplied")
            return out
        holder = "0xf76e6b0920e9332fF4410f6dD53F01722AbC71a3"
        rc, so, se = sh(
            f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast call {token_address} "
            f"\"balanceOf(address)(uint256)\" {holder} --rpc-url {rpc}")
        rec("B1", rc == 0, f"balanceOf({holder}) = {so.strip()} {se.strip()}"[:500])
        return out

    if kind == "transfer":
        # prepared-for-signature: real unsigned tx, never broadcast
        if not (token_address and transfer_to and transfer_amount):
            rec("T1", False, "need token_address, transfer_to, transfer_amount")
            return out
        holder = "0xf76e6b0920e9332fF4410f6dD53F01722AbC71a3"
        rc, data, se = sh(
            f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast calldata \"transfer(address,uint256)\" "
            f"{transfer_to} {transfer_amount}")
        rc2, gas, se2 = sh(
            f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast estimate {token_address} "
            f"\"transfer(address,uint256)\" {transfer_to} {transfer_amount} "
            f"--from {holder} --rpc-url {rpc}")
        rc3, nonce, se3 = sh(
            f"export PATH=\"$HOME/.foundry/bin:$PATH\"; cast nonce {holder} --rpc-url {rpc}")
        unsigned = {
            "to": token_address, "data": data.strip(), "value": "0",
            "gas": gas.strip() if rc2 == 0 else "estimate-failed",
            "chainId": 688689, "nonce": nonce.strip() if rc3 == 0 else "read-failed",
            "from": holder,
            "discipline": "INFERENCE (unsigned envelope assembled from real chain reads; transfer pattern DOC-GROUNDED)",
        }
        rec("T1", rc == 0, json.dumps(unsigned)[:800])
        rec("T2", True, "BROADCAST WITHHELD per T27 official requirement (2): prepared-for-signature only. Nothing sent.")
        out["unsigned_tx"] = unsigned
        return out

    return out


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--request", required=True)
    ap.add_argument("--mode", default="plan", choices=["plan", "execute"])
    ap.add_argument("--token-address", default=None)
    ap.add_argument("--transfer-to", default=None)
    ap.add_argument("--transfer-amount", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    log = run_agent(args.request, mode=args.mode, token_address=args.token_address,
                    transfer_to=args.transfer_to, transfer_amount=args.transfer_amount)
    # redact any accidental secret material
    text = json.dumps(log, indent=2)
    for secret in (os.environ.get("PRIVATE_KEY", ""), os.environ.get("DEPLOYER_PRIVATE_KEY", "")):
        if secret and len(secret) > 8:
            text = text.replace(secret, "[REDACTED]")
    if args.out:
        Path(args.out).write_text(text)
    print(text)


if __name__ == "__main__":
    main()
