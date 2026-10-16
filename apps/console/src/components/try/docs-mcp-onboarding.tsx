/**
 * T03 · Docs MCP Onboarding — "From question to command in 30 seconds" (Tier C).
 *
 * A guided picker: the visitor chooses what they want to do (read state / send /
 * deploy / watch events) and the panel generates the EXACT copy-paste cast/forge
 * command with Atlantic RPC + chain ID filled in, plus a one-line explanation of
 * every flag. Nothing executes in the browser — the visitor runs it in their own
 * terminal. LIGHTKEEPER never sees, holds, or asks for private keys.
 *
 * Every command shape is grounded in the real Docs-MCP query log captured
 * 2026-10-16 (tasks/t03-docs-mcp-onboarding/evidence.json): chain identity
 * (688689 / PHRS), the 100-block get_logs paging answer, the Chain MCP tools
 * answer, and the documented faucet/arena gaps.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { ATLANTIC_RPC_URL, ATLANTIC_CHAIN_ID, isValidAddress } from "../../hooks/useAtlantic";

type GoalId = "read" | "send" | "deploy" | "watch";

const GH = "https://github.com/mohamedwael201193/lightkeeper/tree/main/tasks/t03-docs-mcp-onboarding";

const DOC_LINKS: Record<string, string> = {
  atlantic: "https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md",
  mcp: "https://docs.pharos.xyz/tooling-and-infrastructure/mcp.md",
  jsonrpc: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md",
  piggybank: "https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide.md",
};

interface FlagExpl {
  flag: string;
  what: string;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-outline"
      style={{ minHeight: 36, fontSize: "0.8rem" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function CommandBlock({ cmd, flags, copyLabel }: { cmd: string; flags: FlagExpl[]; copyLabel: string }) {
  return (
    <div className="space-y-3">
      <div className="code-block">{cmd}</div>
      <div className="flex flex-wrap gap-2">
        <CopyBtn text={cmd} label={copyLabel} />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Flag</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.flag}>
              <td className="font-mono text-xs whitespace-nowrap text-ink">{f.flag}</td>
              <td className="text-xs text-slate">{f.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#c3cfe8] bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:border-[var(--accent)]";

export default function TryDocsMcpOnboarding({ lamp }: { lamp: Lamp }) {
  const [goal, setGoal] = useState<GoalId>("read");
  const [readKind, setReadKind] = useState("balance");
  const [addr, setAddr] = useState("");
  const [sig, setSig] = useState("totalSupply()(uint256)");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [solFile, setSolFile] = useState("src/MyToken.sol");
  const [contractName, setContractName] = useState("MyToken");
  const [ctorArgs, setCtorArgs] = useState("");
  const [watchAddr, setWatchAddr] = useState("");
  const [fromBlock, setFromBlock] = useState("latest");
  const [topic, setTopic] = useState("");

  const goals: { id: GoalId; title: string; blurb: string }[] = [
    { id: "read", title: "Read state", blurb: "balances, calls, blocks — free, no signature" },
    { id: "send", title: "Send", blurb: "move dust PHRS from your own wallet" },
    { id: "deploy", title: "Deploy", blurb: "publish a contract with forge" },
    { id: "watch", title: "Watch events", blurb: "stream logs from a contract" },
  ];

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-ink">From question to command in 30 seconds</h3>
        <span className="chip chip-info">Tier C — CLI builder</span>
        <span className="chip chip-pass">0 PHRS spent here</span>
      </div>
      <p className="text-sm text-slate">
        Pick what you want to do and this panel builds the exact <code className="font-mono">cast</code>/
        <code className="font-mono">forge</code> command — Atlantic RPC and chain ID already filled in,
        from answers the real Pharos docs gave us on 2026-10-16. Copy it, run it in your own terminal.
        LIGHTKEEPER never executes anything for you and never asks for your private key.
      </p>

      {/* chain constants */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="chip chip-dim">chain {ATLANTIC_CHAIN_ID}</span>
        <span className="chip chip-dim">rpc {ATLANTIC_RPC_URL}</span>
        <span className="chip chip-dim">native PHRS</span>
        <a
          className="chip chip-info hover:underline"
          href={DOC_LINKS.atlantic}
          target="_blank"
          rel="noreferrer"
          title="Docs-MCP answer Q2: chain identity"
        >
          docs: atlantic testnet
        </a>
      </div>

      {/* step 1: picker */}
      <div>
        <p className="smallcaps mb-2 text-slate">Step 1 — what do you want to do?</p>
        <div className="grid gap-2 sm:grid-cols-4">
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(g.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                goal === g.id
                  ? "border-[var(--accent)] bg-[var(--tint)]"
                  : "border-[#c3cfe8] bg-white hover:border-[var(--accent)]"
              }`}
            >
              <p className="text-sm font-bold text-ink">{g.title}</p>
              <p className="mt-1 text-xs text-slate">{g.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {/* step 2: per-goal builder */}
      <div>
        <p className="smallcaps mb-2 text-slate">Step 2 — fill the blanks, copy the command</p>

        {goal === "read" && (
          <div className="space-y-4 rounded-xl border border-hairline bg-porcelain p-5">
            <div className="flex flex-wrap gap-2">
              {[
                ["balance", "Balance"],
                ["call", "Contract call"],
                ["block", "Latest block"],
                ["chainid", "Chain ID"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setReadKind(id)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    readKind === id
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[#c3cfe8] bg-white text-ink hover:border-[var(--accent)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(readKind === "balance" || readKind === "call") && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Contract / account address</label>
                <input
                  className={inputCls}
                  placeholder="0x…"
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                />
                {addr && !isValidAddress(addr) && (
                  <p className="mt-1 text-xs text-fail">That is not a valid 0x address — the command is not generated yet.</p>
                )}
              </div>
            )}

            {readKind === "call" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Call signature</label>
                <input
                  className={inputCls}
                  value={sig}
                  onChange={(e) => setSig(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate">
                  Examples: <code className="font-mono">totalSupply()(uint256)</code>,{" "}
                  <code className="font-mono">balanceOf(address)(uint256)</code>
                </p>
              </div>
            )}

            {readKind === "balance" &&
              (isValidAddress(addr) ? (
                <CommandBlock
                  cmd={`cast balance ${addr.trim()} --rpc-url ${ATLANTIC_RPC_URL}`}
                  copyLabel="Copy balance command"
                  flags={[
                    { flag: "--rpc-url", what: "Which node to ask — the Atlantic testnet RPC." },
                  ]}
                />
              ) : (
                <div className="empty-panel px-5 py-4 text-xs text-slate">Enter a valid address to generate the balance command.</div>
              ))}

            {readKind === "call" &&
              (isValidAddress(addr) && sig.trim() ? (
                <CommandBlock
                  cmd={`cast call ${addr.trim()} "${sig.trim()}" --rpc-url ${ATLANTIC_RPC_URL}`}
                  copyLabel="Copy call command"
                  flags={[
                    { flag: '"sig()"', what: 'The function to simulate, e.g. "balanceOf(address)(uint256)" — appended address arg goes after the quotes.' },
                    { flag: "--rpc-url", what: "Which node to simulate the call against — Atlantic testnet." },
                  ]}
                />
              ) : (
                <div className="empty-panel px-5 py-4 text-xs text-slate">Enter a valid address and signature to generate the call command.</div>
              ))}

            {readKind === "block" && (
              <CommandBlock
                cmd={`cast block-number --rpc-url ${ATLANTIC_RPC_URL}`}
                copyLabel="Copy block-number command"
                flags={[{ flag: "--rpc-url", what: "Which node to ask — Atlantic testnet." }]}
              />
            )}

            {readKind === "chainid" && (
              <div className="space-y-3">
                <CommandBlock
                  cmd={`cast chain-id --rpc-url ${ATLANTIC_RPC_URL}`}
                  copyLabel="Copy chain-id command"
                  flags={[{ flag: "--rpc-url", what: "Which node to ask — Atlantic testnet." }]}
                />
                <p className="text-xs text-slate">
                  Expected answer: <code className="font-mono">688689</code>.{" "}
                  <a className="text-[var(--accent)] hover:underline" href={DOC_LINKS.atlantic} target="_blank" rel="noreferrer">
                    Docs: Atlantic testnet
                  </a>
                </p>
              </div>
            )}
          </div>
        )}

        {goal === "send" && (
          <div className="space-y-4 rounded-xl border border-hairline bg-porcelain p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">To (your address)</label>
                <input className={inputCls} placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Amount (PHRS, ≤ 0.01 dust)</label>
                <input className={inputCls} placeholder="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            {isValidAddress(to) && amount.trim() ? (
              <div className="space-y-3">
                <CommandBlock
                  cmd={`cast send ${to.trim()} --value ${amount.trim()}ether --rpc-url ${ATLANTIC_RPC_URL} --private-key $ATLANTIC_PRIVATE_KEY`}
                  copyLabel="Copy send command"
                  flags={[
                    { flag: "--value", what: "Amount in ether units (PHRS has 18 decimals, like ETH) — 0.001ether = 0.001 PHRS." },
                    { flag: "--rpc-url", what: "Broadcast to the Atlantic testnet RPC." },
                    { flag: "--private-key", what: "Your key, read from YOUR env var $ATLANTIC_PRIVATE_KEY. LIGHTKEEPER never sees it — never paste a key into this page." },
                  ]}
                />
                <p className="text-xs text-slate">
                  Real on-chain write: cast signs locally and broadcasts from <em>your</em> machine. Keep dust amounts —
                  testnet gas is cheap but the 0.01 PHRS rule still applies.
                </p>
              </div>
            ) : (
              <div className="empty-panel px-5 py-4 text-xs text-slate">Enter a valid destination address and amount to generate the send command.</div>
            )}
          </div>
        )}

        {goal === "deploy" && (
          <div className="space-y-4 rounded-xl border border-hairline bg-porcelain p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Solidity file</label>
                <input className={inputCls} value={solFile} onChange={(e) => setSolFile(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Contract name</label>
                <input className={inputCls} value={contractName} onChange={(e) => setContractName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Constructor args (optional, space-separated)</label>
              <input className={inputCls} placeholder="e.g. &quot;My Token&quot; MTK" value={ctorArgs} onChange={(e) => setCtorArgs(e.target.value)} />
            </div>
            {solFile.trim() && contractName.trim() ? (
              <div className="space-y-3">
                <CommandBlock
                  cmd={`forge create ${solFile.trim()}:${contractName.trim()} --rpc-url ${ATLANTIC_RPC_URL} --private-key $ATLANTIC_PRIVATE_KEY --chain-id ${ATLANTIC_CHAIN_ID}${ctorArgs.trim() ? ` --constructor-args ${ctorArgs.trim()}` : ""}`}
                  copyLabel="Copy deploy command"
                  flags={[
                    { flag: "--rpc-url", what: "Broadcast the deployment to the Atlantic testnet RPC." },
                    { flag: "--private-key", what: "Your key from YOUR env var. LIGHTKEEPER never sees it." },
                    { flag: "--chain-id", what: `Pin 688689. The docs never label the hosted Chain MCP as chain 1672 (Pacific mainnet, PROS) — if you deploy through the wrong tooling you land on mainnet. The docs answer itself confirmed the ambiguity.` },
                    { flag: "--constructor-args", what: "Values passed to the constructor, space-separated — only shown when you fill them in." },
                  ]}
                />
                <p className="text-xs text-slate">
                  ⚠️ Chain-identity trap (confirmed docs gap G2): hosted Chain MCP = chain 1672/PROS = Pacific
                  mainnet. This command pins 688689 so your contract cannot land on the wrong chain.{" "}
                  <a className="text-[var(--accent)] hover:underline" href={DOC_LINKS.mcp} target="_blank" rel="noreferrer">
                    Docs: Pharos MCP
                  </a>
                </p>
              </div>
            ) : (
              <div className="empty-panel px-5 py-4 text-xs text-slate">Fill the Solidity file and contract name to generate the deploy command.</div>
            )}
          </div>
        )}

        {goal === "watch" && (
          <div className="space-y-4 rounded-xl border border-hairline bg-porcelain p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Contract address</label>
                <input className={inputCls} placeholder="0x…" value={watchAddr} onChange={(e) => setWatchAddr(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">From block</label>
                <input className={inputCls} placeholder="latest" value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Event topic (optional, 0x topic hash)</label>
              <input className={inputCls} placeholder="0x…" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <p className="mt-1 text-xs text-slate">
                Get the topic hash from the event signature: <code className="font-mono">cast sig-event "Transfer(address,address,uint256)"</code>
              </p>
            </div>
            {isValidAddress(watchAddr) && fromBlock.trim() ? (
              <div className="space-y-3">
                <CommandBlock
                  cmd={`cast logs --rpc-url ${ATLANTIC_RPC_URL} --address ${watchAddr.trim()} --from-block ${fromBlock.trim()}${topic.trim() ? ` --topic ${topic.trim()}` : ""}`}
                  copyLabel="Copy logs command"
                  flags={[
                    { flag: "--address", what: "Only events emitted by this contract." },
                    { flag: "--from-block", what: 'Start scanning at this block — "latest" for the tip, or a number.' },
                    { flag: "--topic", what: "Optional filter: the keccak topic hash of the event (cast sig-event … gives it)." },
                  ]}
                />
                <p className="text-xs text-slate">
                  Keep ranges ≤ 100 blocks: the docs answer (Q5) says <code className="font-mono">eth_getLogs</code> is
                  capped at 100 blocks when rate limiting is on, 10,000 max otherwise.{" "}
                  <a className="text-[var(--accent)] hover:underline" href={DOC_LINKS.jsonrpc} target="_blank" rel="noreferrer">
                    Docs: JSON-RPC methods
                  </a>
                </p>
              </div>
            ) : (
              <div className="empty-panel px-5 py-4 text-xs text-slate">Enter a valid contract address and from-block to generate the logs command.</div>
            )}
          </div>
        )}
      </div>

      {/* step 3: evidence */}
      <div>
        <p className="smallcaps mb-2 text-slate">Step 3 — the evidence behind these commands</p>
        <div className="space-y-2 rounded-xl border border-hairline bg-white p-5 text-sm text-slate">
          <p>
            9 onboarding questions asked against the real Pharos docs surfaces (2026-10-16), logged verbatim —
            8 answered, 5 confirmed docs gaps. Replay the whole log yourself:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="code-block flex-1" style={{ padding: "0.6rem 0.9rem" }}>
              cd tasks/t03-docs-mcp-onboarding && python3 scripts/query_log.py run
            </div>
            <CopyBtn text="cd tasks/t03-docs-mcp-onboarding && python3 scripts/query_log.py run" label="Copy replay command" />
          </div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <a className="chip chip-info hover:underline" href={`${GH}/evidence.md`} target="_blank" rel="noreferrer">query log (evidence.md)</a>
            <a className="chip chip-info hover:underline" href={`${GH}/evidence.json`} target="_blank" rel="noreferrer">raw verbatim log (evidence.json)</a>
            <a className="chip chip-info hover:underline" href={`${GH}/QUICKSTART.md`} target="_blank" rel="noreferrer">first-5-queries quickstart</a>
            <a className="chip chip-dim" href={`${GH}/scripts/query_log.py`} target="_blank" rel="noreferrer">runner script</a>
          </div>
          <p className="text-xs">
            Honest gaps we documented, not hidden: no official faucet URL in the docs (G3), the Agent Arena is
            absent from the developer docs (G4), and the public ask endpoint is flaky for scripted access (G1).{" "}
            <span className="font-semibold text-ink">{lamp.name}</span> is complete by design — read-only research, 0 PHRS spent.
          </p>
        </div>
      </div>
    </div>
  );
}
