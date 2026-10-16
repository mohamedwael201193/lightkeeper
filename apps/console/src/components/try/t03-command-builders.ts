/**
 * T03 · Docs MCP Onboarding — pure command-builder logic (no JSX).
 *
 * Every command shape is byte-exact and grounded in the real Docs-MCP query
 * log captured 2026-10-16 (tasks/t03-docs-mcp-onboarding/evidence.json):
 * chain identity (688689 / PHRS), the 100-block eth_getLogs paging answer,
 * and the documented faucet/arena gaps.
 *
 * This module is intentionally framework-free so the generated commands can
 * be re-verified byte-for-byte outside the browser: every shape is asserted
 * against an expected string by the task agent's verification pass. The
 * console calls it with ATLANTIC_RPC_URL / ATLANTIC_CHAIN_ID and the real
 * isValidAddress from useAtlantic — nothing is hardcoded here.
 *
 * No private keys anywhere: signing commands reference the VISITOR's own
 * env var $ATLANTIC_PRIVATE_KEY, never a literal value.
 */

export type GoalId = "read" | "send" | "deploy" | "watch";
export type ReadKind = "balance" | "call" | "block" | "chainid";
export type WatchMode = "single" | "paged";

/** One flag and its plain-language explanation. */
export interface FlagExpl {
  flag: string;
  what: string;
}

/** Everything the user typed in Act 01. */
export interface BuilderInputs {
  goal: GoalId;
  readKind: ReadKind;
  /** read: balance/call — contract or account address */
  addr: string;
  /** read: call — e.g. "totalSupply()(uint256)" */
  sig: string;
  /** read: call — space-separated args cast ABI-encodes */
  callArgs: string;
  /** send */
  to: string;
  amount: string;
  /** deploy */
  solFile: string;
  contractName: string;
  ctorArgs: string;
  /** watch */
  watchAddr: string;
  watchMode: WatchMode;
  fromBlock: string;
  endBlock: string;
  evtSig: string;
}

export interface ChainCtx {
  rpc: string;
  chainId: number;
}

/** A supporting fact shown under the result. */
export interface FactRow {
  label: string;
  value: string;
}

export interface BuiltCommand {
  /** Byte-exact command to paste into a terminal. */
  command: string;
  flags: FlagExpl[];
  facts: FactRow[];
  /** Plain sentence shown under the command. */
  note?: string;
  /** Short title for the result card ("Send command", …). */
  resultTitle: string;
}

/** Thrown when inputs cannot produce a command yet. Message is plain language. */
export class BuildValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildValidationError";
  }
}

export const DUST_CAP_PHRS = 0.01;
export const PAGE_STEP = 100;

export function sanityCheckCommand(ctx: ChainCtx): string {
  return `cast chain-id --rpc-url ${ctx.rpc}`;
}

function req(cond: boolean, message: string): asserts cond {
  if (!cond) throw new BuildValidationError(message);
}

/**
 * Stage-0 validation. Throws BuildValidationError with a plain-language
 * message when the inputs cannot produce a command yet. The assemblers
 * below may assume validation has passed.
 */
export function validateInputs(inputs: BuilderInputs, isValid: (a: string) => boolean): void {
  switch (inputs.goal) {
    case "read":
      if (inputs.readKind === "balance" || inputs.readKind === "call") {
        req(
          isValid(inputs.addr.trim()),
          "That doesn't look like a 0x address. Paste a 42-character 0x address and the command will build itself."
        );
        if (inputs.readKind === "call") {
          req(
            inputs.sig.trim().length > 0,
            "Add a call signature first — e.g. totalSupply()(uint256) — and the command will build itself."
          );
        }
      }
      return;
    case "send": {
      req(
        isValid(inputs.to.trim()),
        "Enter a valid destination address (42-character 0x) and a dust amount, and the send command will build itself."
      );
      const amt = parseFloat(inputs.amount.trim());
      req(inputs.amount.trim() !== "" && !Number.isNaN(amt) && amt > 0,
        "The amount must be a positive number of PHRS, e.g. 0.001.");
      req(amt <= DUST_CAP_PHRS,
        `${inputs.amount.trim()} PHRS is above the ${DUST_CAP_PHRS} PHRS dust cap. This builder only generates dust-sized sends — lower the amount and it will generate the command.`);
      return;
    }
    case "deploy":
      req(
        inputs.solFile.trim().length > 0 && inputs.contractName.trim().length > 0,
        "Fill the Solidity file and the contract name and the deploy command will build itself."
      );
      return;
    case "watch": {
      req(
        isValid(inputs.watchAddr.trim()),
        "Enter a valid contract address (42-character 0x) and the logs command will build itself."
      );
      if (inputs.watchMode === "single") {
        req(
          inputs.fromBlock.trim().length > 0,
          "Enter a from-block (e.g. latest, or a block number) and the logs command will build itself."
        );
        return;
      }
      const s = parseInt(inputs.fromBlock.trim(), 10);
      const e = parseInt(inputs.endBlock.trim(), 10);
      req(!Number.isNaN(s) && !Number.isNaN(e) && s >= 0 && e >= 0,
        "Paged mode needs numeric start and end blocks, e.g. 31486336 and 31487236.");
      req(e >= s, "End block must be ≥ start block.");
      return;
    }
  }
}

function assembleRead(i: BuilderInputs, ctx: ChainCtx): BuiltCommand {
  if (i.readKind === "block") {
    return {
      command: `cast block-number --rpc-url ${ctx.rpc}`,
      flags: [{ flag: "--rpc-url", what: "Which node to ask — the Atlantic testnet RPC." }],
      facts: [
        { label: "Network", value: `chain ${ctx.chainId} (Atlantic testnet)` },
        { label: "RPC endpoint", value: ctx.rpc },
      ],
      note: "Free read — no signature, no gas.",
      resultTitle: "Block-number command",
    };
  }
  if (i.readKind === "chainid") {
    return {
      command: sanityCheckCommand(ctx),
      flags: [{ flag: "--rpc-url", what: "Which node to ask — the Atlantic testnet RPC." }],
      facts: [
        { label: "Network", value: `chain ${ctx.chainId} (Atlantic testnet)` },
        { label: "RPC endpoint", value: ctx.rpc },
      ],
      note: `Expected answer: ${ctx.chainId}. If it prints anything else, your RPC points at the wrong network.`,
      resultTitle: "Chain-ID command",
    };
  }
  const addr = i.addr.trim();
  if (i.readKind === "balance") {
    return {
      command: `cast balance ${addr} --rpc-url ${ctx.rpc}`,
      flags: [{ flag: "--rpc-url", what: "Which node to ask — the Atlantic testnet RPC." }],
      facts: [
        { label: "Account", value: addr },
        { label: "RPC endpoint", value: ctx.rpc },
      ],
      note: "Free read — returns the PHRS balance in wei.",
      resultTitle: "Balance command",
    };
  }
  const args = i.callArgs.trim() ? ` ${i.callArgs.trim()}` : "";
  return {
    command: `cast call ${addr} "${i.sig.trim()}"${args} --rpc-url ${ctx.rpc}`,
    flags: [
      {
        flag: '"sig()" args…',
        what: 'The function to simulate, plus any arguments cast ABI-encodes after the signature, e.g. "balanceOf(address)(uint256)" 0x0000…dEaD.',
      },
      { flag: "--rpc-url", what: "Which node to simulate the call against — the Atlantic testnet." },
    ],
    facts: [
      { label: "Contract", value: addr },
      { label: "Signature", value: i.sig.trim() },
      { label: "RPC endpoint", value: ctx.rpc },
    ],
    note: "Free read — cast simulates the call locally against chain state, nothing is sent.",
    resultTitle: "Contract-call command",
  };
}

function assembleSend(i: BuilderInputs, ctx: ChainCtx): BuiltCommand {
  const to = i.to.trim();
  const amount = i.amount.trim();
  return {
    command: `cast send ${to} --value ${amount}ether --rpc-url ${ctx.rpc} --private-key $ATLANTIC_PRIVATE_KEY`,
    flags: [
      { flag: "--value", what: "Amount in ether units (PHRS has 18 decimals, like ETH) — 0.001ether = 0.001 PHRS." },
      { flag: "--rpc-url", what: "Broadcast to the Atlantic testnet RPC." },
      {
        flag: "--private-key",
        what: "Your key, read from YOUR env var $ATLANTIC_PRIVATE_KEY. LIGHTKEEPER never sees it — never paste a key into this page.",
      },
    ],
    facts: [
      { label: "To", value: to },
      { label: "Amount", value: `${amount} PHRS (dust, ≤ ${DUST_CAP_PHRS})` },
      { label: "Network", value: `chain ${ctx.chainId} (Atlantic testnet)` },
      { label: "Signer", value: "your $ATLANTIC_PRIVATE_KEY — never leaves your machine" },
    ],
    note: "Real on-chain write: cast signs locally and broadcasts from YOUR machine.",
    resultTitle: "Send command",
  };
}

function assembleDeploy(i: BuilderInputs, ctx: ChainCtx): BuiltCommand {
  const ctor = i.ctorArgs.trim() ? ` --constructor-args ${i.ctorArgs.trim()}` : "";
  return {
    command: `forge create ${i.solFile.trim()}:${i.contractName.trim()} --rpc-url ${ctx.rpc} --private-key $ATLANTIC_PRIVATE_KEY --chain-id ${ctx.chainId}${ctor}`,
    flags: [
      { flag: "--rpc-url", what: "Broadcast the deployment to the Atlantic testnet RPC." },
      { flag: "--private-key", what: "Your key from YOUR env var. LIGHTKEEPER never sees it." },
      {
        flag: "--chain-id",
        what: `Pin ${ctx.chainId}. The docs never label the hosted Chain MCP as chain 1672 (Pacific mainnet, PROS) — if you deploy through the wrong tooling you land on mainnet. The docs answer itself confirmed the ambiguity.`,
      },
      { flag: "--constructor-args", what: "Values passed to the constructor, space-separated — only shown when you fill them in." },
    ],
    facts: [
      { label: "Target", value: `${i.solFile.trim()}:${i.contractName.trim()}` },
      { label: "Chain pin", value: `${ctx.chainId} (Atlantic testnet — NOT 1672 Pacific)` },
      { label: "Signer", value: "your $ATLANTIC_PRIVATE_KEY — never leaves your machine" },
    ],
    note: "Chain-identity trap, confirmed docs gap: the hosted Chain MCP points at chain 1672/PROS (Pacific mainnet). This command pins the Atlantic chain ID so your contract cannot land on the wrong chain.",
    resultTitle: "Deploy command",
  };
}

function assembleWatch(i: BuilderInputs, ctx: ChainCtx): BuiltCommand {
  const addr = i.watchAddr.trim();
  const sigPart = i.evtSig.trim() ? `"${i.evtSig.trim()}" ` : "";
  if (i.watchMode === "single") {
    return {
      command: `cast logs ${sigPart}--rpc-url ${ctx.rpc} --address ${addr} --from-block ${i.fromBlock.trim()}`,
      flags: [
        {
          flag: '"Event(…)"',
          what: "Optional event signature (or 0x topic hash) as the first positional argument — filters to that event only. Note: cast has no --topic flag.",
        },
        { flag: "--address", what: "Only events emitted by this contract." },
        { flag: "--from-block", what: 'Start scanning at this block — "latest" for the tip, or a number.' },
      ],
      facts: [
        { label: "Contract", value: addr },
        { label: "From block", value: i.fromBlock.trim() },
        { label: "Range cap", value: "≤ 100 blocks per query (docs answer Q5)" },
      ],
      note: "Keep ranges ≤ 100 blocks: the docs answer (Q5) says eth_getLogs is capped at 100 blocks when rate limiting is on, 10,000 max otherwise. For anything wider, use the paged-range mode.",
      resultTitle: "Logs command",
    };
  }
  const s = parseInt(i.fromBlock.trim(), 10);
  const e = parseInt(i.endBlock.trim(), 10);
  const sigAssign = i.evtSig.trim() ? `topic="${i.evtSig.trim()}"` : `topic=""`;
  const sigRef = i.evtSig.trim() ? '"$topic"' : "";
  const command =
    `start=${s}; end=${e}; step=${PAGE_STEP}; addr=${addr}; ${sigAssign}\n` +
    `while [ $start -le $end ]; do\n` +
    `  stop=$((start+step-1)); [ $stop -gt $end ] && stop=$end\n` +
    `  echo "== blocks $start..$stop =="\n` +
    `  cast logs ${sigRef} --rpc-url ${ctx.rpc} --address "$addr" --from-block "$start" --to-block "$stop"\n` +
    `  start=$((stop+1))\n` +
    `done`;
  const pages = Math.ceil((e - s + 1) / PAGE_STEP);
  return {
    command,
    flags: [
      { flag: `step=${PAGE_STEP}`, what: "The docs-confirmed eth_getLogs range cap (Q5): 100 blocks per page when rate limiting is on." },
      { flag: "--to-block", what: "Each page is bounded — no single request ever exceeds the cap." },
    ],
    facts: [
      { label: "Contract", value: addr },
      { label: "Range", value: `${s} → ${e}` },
      { label: "Pages", value: `${pages} × ≤100 blocks (docs cap)` },
    ],
    note: "Tested live against Atlantic on 2026-10-16: a 150-block range split into two pages, both returned. Pure bash + cast — paste into any terminal, no dependencies.",
    resultTitle: "Paged scan script",
  };
}

function assemble(inputs: BuilderInputs, ctx: ChainCtx): BuiltCommand {
  switch (inputs.goal) {
    case "read":
      return assembleRead(inputs, ctx);
    case "send":
      return assembleSend(inputs, ctx);
    case "deploy":
      return assembleDeploy(inputs, ctx);
    case "watch":
      return assembleWatch(inputs, ctx);
  }
}

/**
 * Loose-but-honest address check (0x + 40 hex). The console passes the real
 * isValidAddress from useAtlantic; this fallback is what the byte-verification
 * script uses outside the browser.
 */
export function isValidAddressLoose(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

/**
 * Build the command for the given inputs. Throws BuildValidationError with a
 * plain-language message when the inputs are incomplete.
 */
export function buildCommand(inputs: BuilderInputs, ctx: ChainCtx, isValid: (a: string) => boolean): BuiltCommand {
  validateInputs(inputs, isValid);
  return assemble(inputs, ctx);
}

/** The real staged pipeline the ProgressLoader mirrors — one stage per real code step. */
export const BUILD_STAGES = [
  "Validating your inputs",
  "Composing the command",
  "Attaching flag explanations",
] as const;

export interface PipelineStep {
  index: number;
  label: string;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

/**
 * Runs the three real stages, calling onStep before each so the loader
 * reflects what the code is actually doing. Stage 0 throws
 * BuildValidationError when inputs are incomplete — that becomes the
 * ErrorState.
 */
export async function runBuildPipeline(
  inputs: BuilderInputs,
  ctx: ChainCtx,
  isValid: (a: string) => boolean,
  onStep: (step: PipelineStep) => void
): Promise<BuiltCommand> {
  onStep({ index: 0, label: BUILD_STAGES[0] });
  await nextFrame();
  // Stage 0: full validation pass — fails fast with a plain-language reason.
  validateInputs(inputs, isValid);
  onStep({ index: 1, label: BUILD_STAGES[1] });
  await nextFrame();
  // Stage 1: assemble the byte-exact command string.
  const built = assemble(inputs, ctx);
  onStep({ index: 2, label: BUILD_STAGES[2] });
  await nextFrame();
  // Stage 2: flag explanations are attached by the assembler — this stage is
  // the explicit completeness check the loader reports.
  if (built.flags.length === 0) {
    throw new BuildValidationError("The builder produced no flag explanations — refusing to show an unexplained command.");
  }
  return built;
}
