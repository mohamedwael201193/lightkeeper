/**
 * t09-trend-watcher — local durable state (SkillEngine has no native state/cron).
 *
 * Community pattern (per campaign research §244): local append-only JSONL +
 * a small runtime.json snapshot. This state lives in ./state/ which is
 * GITIGNORED and never committed — the repo documents the pattern, the
 * machine holds the memory.
 *
 * Files (all inside cfg.state.dir):
 *   observations.jsonl  one JSON object per evaluated sample (the memory)
 *   runtime.json        priors snapshot: streak, lastFireBlock, counters
 *   audit.jsonl         decision log: every FIRE/HOLD with reason (the audit trail)
 */
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function statePaths(cfg) {
  const dir = cfg.state.dir;
  return {
    dir,
    observations: join(dir, cfg.state.observations),
    runtime: join(dir, cfg.state.runtime),
    audit: join(dir, cfg.state.audit),
  };
}

export function ensureStateDir(paths) {
  mkdirSync(paths.dir, { recursive: true });
}

/** Load priors; returns {streak, lastFireBlock, ...} — defaults on first run. */
export function loadPriors(paths) {
  if (!existsSync(paths.runtime)) {
    return { streak: 0, lastFireBlock: null, samplesTotal: 0, firesTotal: 0, chainId: null, metric: null, params: null };
  }
  return JSON.parse(readFileSync(paths.runtime, "utf8"));
}

/** Persist the observation row (one JSON object per line). */
export function appendObservation(paths, row) {
  appendFileSync(paths.observations, JSON.stringify(row) + "\n");
}

/** Persist a decision audit entry (one JSON object per line). */
export function appendAudit(paths, entry) {
  appendFileSync(paths.audit, JSON.stringify(entry) + "\n");
}

/** Save the runtime snapshot (priors for the next run). */
export function saveRuntime(paths, runtime) {
  writeFileSync(paths.runtime, JSON.stringify(runtime, null, 2) + "\n");
}

/** Read back the last N observation rows (for the report). */
export function readObservations(paths, limit = 50) {
  if (!existsSync(paths.observations)) return [];
  const lines = readFileSync(paths.observations, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l));
}
