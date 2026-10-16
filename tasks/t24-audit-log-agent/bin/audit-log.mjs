#!/usr/bin/env node
/**
 * t24-audit-log-agent CLI.
 *
 *   audit-log log      --actor A --action ACT [--params JSON] [--tx HASH] [--note N] [--log PATH]
 *   audit-log verify   [--log PATH] [--json]
 *   audit-log transcript [--log PATH] [--out PATH]
 *   audit-log report   --wallet ADDR [--from-block N] [--to-block N]
 *                      [--from-date ISO] [--to-date ISO] [--max-scan-blocks N]
 *                      [--export md,csv,pdf] [--outdir DIR] [--log PATH]
 *
 * Append-only, hash-chained audit log. The log records REAL agent actions with
 * REAL tx hashes. Runtime logs live in state/ (gitignored); snapshots of real
 * transcripts go to sample-output/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { appendEntry, verifyLog, loadEntries, txLink, getChainId, getBlockNumber, getBalanceWei, weiToPhrs } from "../src/lib.mjs";
import { buildReport, toMarkdown, toCsv, toPdf } from "../src/report.mjs";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_LOG = resolve(ROOT, "state/audit-log.jsonl");

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2).replace(/-/g, "_");
      out[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    } else out._.push(a);
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const a = args(rest);

async function cmdLog() {
  if (!a.actor || !a.action) { console.error("usage: audit-log log --actor A --action ACT [--params JSON] [--tx HASH] [--note N]"); process.exit(2); }
  let params = null;
  if (a.params) { try { params = JSON.parse(a.params); } catch { params = a.params; } }
  const entry = appendEntry(a.log || DEFAULT_LOG, { actor: a.actor, action: a.action, params, txHash: a.tx || null, note: a.note || null });
  console.log(JSON.stringify(entry, null, 2));
}

async function cmdVerify() {
  const r = verifyLog(a.log || DEFAULT_LOG);
  if (a.json === "true" || a.json === true) { console.log(JSON.stringify(r, null, 2)); }
  else {
    console.log(`entries checked: ${r.checked}`);
    if (r.ok) console.log("VERIFY: PASS — chain intact, every entry hash matches its content and links to its predecessor.");
    else { console.log("VERIFY: FAIL"); for (const f of r.failures) console.log(`  entry #${f.index}: ${f.reason}`); }
  }
  process.exit(r.ok ? 0 : 1);
}

async function cmdTranscript() {
  const entries = loadEntries(a.log || DEFAULT_LOG);
  const L = ["# Audit-log transcript", "", `Entries: ${entries.length}`, `Exported: ${new Date().toISOString()}`, ""];
  for (const e of entries) {
    L.push(`## #${e.index} — ${e.action}`);
    L.push(`- timestamp: ${e.timestamp}`, `- actor: ${e.actor}`,
      `- params: \`${JSON.stringify(e.params)}\``,
      e.txHash ? `- tx: [${e.txHash}](${txLink(e.txHash)})` : `- tx: —`,
      e.note ? `- note: ${e.note}` : `- note: —`,
      `- prevHash: ${e.prevHash}`, `- entryHash: ${e.entryHash}`, "");
  }
  const out = L.join("\n");
  if (a.out) { mkdirSync(dirname(resolve(a.out)), { recursive: true }); writeFileSync(a.out, out); console.log(`transcript written: ${a.out}`); }
  else console.log(out);
}

async function cmdReport() {
  if (!a.wallet) { console.error("usage: audit-log report --wallet ADDR [--from-block N] [--to-block N] [--from-date ISO] [--to-date ISO] [--max-scan-blocks N] [--export md,csv,pdf] [--outdir DIR]"); process.exit(2); }
  const cid = await getChainId();
  if (cid !== 688689) throw new Error(`wrong network: chain ${cid}, expected 688689 (Atlantic)`);
  console.error(`chain ${cid} confirmed; scanning…`);
  const r = await buildReport({
    wallet: a.wallet,
    fromBlock: a.from_block ? parseInt(a.from_block) : undefined,
    toBlock: a.to_block ? parseInt(a.to_block) : undefined,
    fromDate: a.from_date, toDate: a.to_date,
    maxScanBlocks: a.max_scan_blocks ? parseInt(a.max_scan_blocks) : 2000,
    onProgress: (d, tot) => console.error(`  block scan ${d}/${tot}`),
  });
  const outdir = resolve(a.outdir || resolve(ROOT, "sample-output"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fmts = (a.export || "md,csv").split(",").map((s) => s.trim());
  mkdirSync(outdir, { recursive: true });
  const files = {};
  if (fmts.includes("md")) { files.md = `${outdir}/audit-report-${stamp}.md`; writeFileSync(files.md, toMarkdown(r)); }
  if (fmts.includes("csv")) { files.csv = `${outdir}/audit-report-${stamp}.csv`; writeFileSync(files.csv, toCsv(r)); }
  if (fmts.includes("pdf")) { files.pdf = `${outdir}/audit-report-${stamp}.pdf`; writeFileSync(files.pdf, toPdf(r)); }
  files.json = `${outdir}/chain-scan-${stamp}.json`; writeFileSync(files.json, JSON.stringify(r, null, 2));
  // self-audit: the report run itself is logged
  appendEntry(a.log || DEFAULT_LOG, {
    actor: "lk-t24-agent", action: "report:generate",
    params: { wallet: a.wallet, range: r.range, totals: r.totals, files: Object.values(files).map((f) => f.split("/").pop()) },
    txHash: null, note: "wallet activity report generated from live RPC",
  });
  console.log(JSON.stringify({ files, totals: r.totals, range: r.range }, null, 2));
}

switch (cmd) {
  case "log": await cmdLog(); break;
  case "verify": await cmdVerify(); break;
  case "transcript": await cmdTranscript(); break;
  case "report": await cmdReport(); break;
  default:
    console.error("commands: log | verify | transcript | report");
    process.exit(2);
}
