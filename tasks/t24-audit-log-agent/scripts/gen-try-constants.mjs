// Generates the constants block for audit-log-agent.tsx from the live state file.
// Usage: node scripts/gen-try-constants.mjs > /tmp/try-constants.txt
// Then paste into the try module. Keeps the embedded chain byte-identical to state.
import { readFileSync } from "node:fs";

const T = "/home/hatch/workspace/lightkeeper/tasks/t24-audit-log-agent";
const lines = readFileSync(`${T}/state/audit-log.jsonl`, "utf8").trimEnd().split("\n");
const entries = lines.map((l) => JSON.parse(l));
const last = entries[entries.length - 1];
const anchor = entries.find((e) => e.action === "tx:chain-anchor");

console.log(`// AUTO-GENERATED from state/audit-log.jsonl — do not hand-edit`);
console.log(`const ENTRY_COUNT = ${entries.length};`);
console.log(`const TERMINAL_ENTRY_HASH = "${last.entryHash}";`);
if (anchor) {
  console.log(`const ANCHOR_SOURCE = { index: ${anchor.params.anchorsEntryIndex}, hash: "${anchor.params.anchorsEntryHash}" };`);
  console.log(`const ANCHOR_TX = { hash: "${anchor.txHash}", block: ${parseInt(anchor.params.blockHex, 16)} };`);
}
console.log(`const REAL_CHAIN_JSONL = \`${lines.join("\n")}\`;`);
