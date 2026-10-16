// gen-lamps.mjs — scans ../../tasks/*/evidence.json + task.yaml and emits
// src/data/lamps.json. Tolerates missing tasks: missing evidence.json means
// the lamp is DIM ("in progress") — a lamp is NEVER marked shipped without
// real evidence.json data. No mock data is ever generated here.
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tasksDir = join(here, "..", "..", "..", "tasks");
const outFile = join(here, "..", "src", "data", "lamps.json");

// Canonical 28-task matrix (Pharos Agent Arena build matrix, from the
// campaign research — task id, name, tier, points, toolkit).
const MATRIX = [
  ["T01", "Read Contract State", "Easy", 50, "Chain MCP"],
  ["T02", "Event/Log Monitor", "Easy", 50, "Chain MCP"],
  ["T03", "Docs MCP Onboarding", "Easy", 50, "Developer Docs MCP"],
  ["T04", "Doc-Search CLI", "Easy", 50, "Developer Docs MCP"],
  ["T05", "Threshold Guardian", "Medium", 100, "SkillEngine"],
  ["T06", "Saga Executor", "Hard", 200, "SkillEngine"],
  ["T07", "Arbitrage Scanner", "Hard", 200, "SkillEngine"],
  ["T08", "Dry-Run Executor", "Medium", 100, "SkillEngine"],
  ["T09", "Trend Watcher", "Hard", 200, "SkillEngine"],
  ["T10", "Batch Executor", "Medium", 100, "SkillEngine"],
  ["T11", "Policy Gatekeeper", "Medium", 100, "SkillEngine"],
  ["T12", "Skill + Chain MCP Flow", "Medium", 100, "Composition"],
  ["T13", "Docs MCP + Chain MCP Agent", "Medium", 100, "Composition"],
  ["T14", "Portfolio Assistant", "Hard", 200, "DeFi / Portfolio"],
  ["T15", "Yield Optimizer", "Hard", 200, "DeFi / Portfolio"],
  ["T16", "Liquidation Watchdog", "Medium", 100, "DeFi / Portfolio"],
  ["T17", "Natural-Language Payment Agent", "Medium", 100, "Payments"],
  ["T18", "Recurring Payment Agent", "Medium", 100, "Payments"],
  ["T19", "Invoice-to-Payment Agent", "Medium", 100, "Payments"],
  ["T20", "On-Chain Alert Bot", "Easy", 50, "Trading / Monitoring"],
  ["T21", "Whale-Watching Agent", "Medium", 100, "Trading / Monitoring"],
  ["T22", "Gas Fee Optimizer", "Medium", 100, "Trading / Monitoring"],
  ["T23", "Wallet Risk Checker", "Medium", 100, "Compliance / Security"],
  ["T24", "Audit-Log Agent", "Medium", 100, "Compliance / Security"],
  ["T25", "dApp Support Agent", "Easy", 50, "Support / Reporting"],
  ["T26", "Weekly Digest Agent", "Medium", 100, "Support / Reporting"],
  ["T27", "Doc-Grounded Builder Agent", "Hard", 200, "Cross-tool / Advanced"],
  ["T28", "Multi-Protocol Aggregator", "Hard", 200, "Cross-tool / Advanced"],
];

// Minimal top-level YAML reader (only `key: value` lines; enough for task.yaml).
function readYamlSimple(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (/^\s/.test(line) || !line.includes(":")) continue;
    const i = line.indexOf(":");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (v === "null" || v === "~") v = null;
    if (/^-?\d+$/.test(v)) v = Number(v);
    out[k] = v;
  }
  return out;
}

function firstParagraphs(md, n = 3, maxLen = 900) {
  const paras = md
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, "").trim())
    .filter((p) => p && !p.startsWith("!") && p.length > 20);
  let text = paras.slice(0, n).join("\n\n");
  if (text.length > maxLen) text = text.slice(0, maxLen).trimEnd() + "…";
  return text;
}

function isTxHash(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
}

const EXPLORER = "https://atlantic.pharosscan.xyz";

// Recursively harvest tx hashes, contract addresses and URLs from the
// wildly-shaped evidence.json files the task builders produce.
function harvestEvidence(node, out) {
  if (typeof node === "string") {
    if (/^0x[0-9a-fA-F]{64}$/.test(node)) out.txs.add(node);
    else if (/^0x[0-9a-fA-F]{40}$/.test(node)) out.contracts.add(node);
    else if (/^https?:\/\//.test(node)) out.urls.add(node);
  } else if (Array.isArray(node)) {
    for (const v of node) harvestEvidence(v, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) harvestEvidence(v, out);
  }
}

function buildActivity(ev) {
  const acts = [];
  const push = (title, detail = "", at = "", link) =>
    acts.push({ title, detail, at, ...(link ? { link } : {}) });
  if (Array.isArray(ev.runs))
    for (const r of ev.runs.slice(0, 4))
      push(`Run: ${r.label ?? r.name ?? "guardian run"}`, String(r.decision ?? r.proposal ?? ""), String(ev.built_utc ?? ""));
  if (ev.deploy && ev.deploy.tx)
    push("Contract deployed", `${String(ev.deploy.tx).slice(0, 12)}…`, String(ev.deploy.block ?? ""));
  if (Array.isArray(ev.emitter_txs))
    for (const t of ev.emitter_txs.slice(0, 3))
      push(`Emitter tx: ${t.call ?? "on-chain event"}`, `block ${t.block ?? "?"}`, "");
  if (ev.liveReads)
    push("Live contract reads", `block read at ${ev.liveReads.blockReadAt ?? "pinned"}`, "");
  if (Array.isArray(ev.link_checks))
    for (const l of ev.link_checks.slice(0, 3))
      push(`Verified link — HTTP ${l.http}`, String(l.url).replace(EXPLORER, "explorer…"), String(l.checked_utc ?? ""), l.url);
  return acts.slice(0, 12);
}

const taskDirs = existsSync(tasksDir)
  ? readdirSync(tasksDir).filter((d) => statSync(join(tasksDir, d)).isDirectory())
  : [];

function dirFor(id) {
  const prefix = id.toLowerCase(); // "t05"
  const cands = taskDirs.filter((d) => d.toLowerCase().startsWith(prefix));
  if (cands.length === 0) return null;
  // Prefer the directory that has the most content (README/task.yaml),
  // not the empty tNN stub.
  return cands
    .map((d) => {
      const p = join(tasksDir, d);
      let score = 0;
      for (const f of ["task.yaml", "README.md", "evidence.json", "SUBMISSION.md"])
        if (existsSync(join(p, f))) score += 1;
      return [score, d];
    })
    .sort((a, b) => b[0] - a[0])[0][1];
}

const lamps = MATRIX.map(([id, name, tier, points, toolkit]) => {
  const dir = dirFor(id);
  const d = dir ? join(tasksDir, dir) : null;
  const lamp = {
    id,
    slug: (dir || id.toLowerCase()).replace(/^t\d+-/, "").replace(/^t\d+$/, id.toLowerCase()),
    name,
    tier,
    points,
    toolkit,
    dir: dir || null,
    status: "in-progress", // may only become "shipped" via evidence below
    has_task_yaml: false,
    has_readme: false,
    readme_summary: "",
    has_evidence_json: false,
    evidence: null,
    txs: [],
    explorer_links: [],
    has_submission: false,
    submission_status: "not started",
    activity: [],
  };
  if (!d) return lamp;

  if (existsSync(join(d, "task.yaml"))) {
    lamp.has_task_yaml = true;
    const y = readYamlSimple(join(d, "task.yaml"));
    if (typeof y.name === "string" && y.name) lamp.name = y.name;
    if (typeof y.points === "number") lamp.points = y.points;
    if (typeof y.toolkit === "string" && y.toolkit) lamp.toolkit = y.toolkit;
    if (typeof y.slug === "string" && y.slug) lamp.slug = y.slug;
  }
  if (existsSync(join(d, "README.md"))) {
    lamp.has_readme = true;
    lamp.readme_summary = firstParagraphs(readFileSync(join(d, "README.md"), "utf8"));
  }
  if (existsSync(join(d, "SUBMISSION.md"))) {
    lamp.has_submission = true;
    const sub = readFileSync(join(d, "SUBMISSION.md"), "utf8");
    lamp.submission_status = /todo|tbd|\[ \]/i.test(sub.slice(0, 400))
      ? "draft"
      : "written — founder submits";
  }
  if (existsSync(join(d, "evidence.json"))) {
    lamp.has_evidence_json = true;
    try {
      const ev = JSON.parse(readFileSync(join(d, "evidence.json"), "utf8"));
      lamp.evidence = ev;
      const harvested = { txs: new Set(), contracts: new Set(), urls: new Set() };
      harvestEvidence(ev, harvested);
      lamp.txs = [...harvested.txs];
      lamp.explorer_links = [
        ...lamp.txs.map((t) => `${EXPLORER}/tx/${t}`),
        ...[...harvested.contracts].map((c) => `${EXPLORER}/address/${c}`),
      ];
      const shippedFlag = ev.shipped === true || ev.status === "shipped";
      // HARD RULE: shipped only with real tx evidence or an explicit shipped flag.
      if (lamp.txs.length > 0 || shippedFlag) lamp.status = "shipped";
      lamp.activity = buildActivity(ev).map((a, i) => ({
        ...a,
        link: a.link ?? (i === 0 && lamp.explorer_links[0] ? lamp.explorer_links[0] : undefined),
      }));
    } catch {
      lamp.has_evidence_json = false;
    }
  }
  return lamp;
});

const secured = lamps.filter((l) => l.status === "shipped");
const out = {
  generated_at: new Date().toISOString(),
  source: "../../tasks/*/evidence.json + task.yaml — statuses from real evidence only",
  total_points: MATRIX.reduce((s, [, , , p]) => s + p, 0),
  lamps_lit: secured.length,
  points_secured: secured.reduce((s, l) => s + l.points, 0),
  tasks: lamps,
};

writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(
  `lamps.json: ${lamps.length} tasks, ${secured.length} shipped, ` +
    `${out.points_secured}/${out.total_points} pts -> ${outFile}`
);
