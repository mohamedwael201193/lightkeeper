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
 *
 * Crash safety: runtime.json is written ATOMICALLY — full payload to a tmp
 * file, fsync the file, rename(2) over the target, fsync the directory — so
 * a SIGKILL landing mid-write can never leave a torn file: the path holds
 * either the complete OLD snapshot or the complete NEW one, never a mix.
 * JSONL appends write the whole line in one write(2) and fsync before close.
 */
import {
  mkdirSync, readFileSync, existsSync, openSync, closeSync,
  renameSync, unlinkSync, writeSync, fsyncSync,
} from "node:fs";
import { dirname, join } from "node:path";

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

/** Atomic JSONL append: open in append mode, single write, fsync, close. */
function appendLineAtomic(path, obj) {
  const fd = openSync(path, "a");
  try {
    writeSync(fd, JSON.stringify(obj) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomic whole-file write: write the FULL new content to `path.tmp.<pid>`,
 * fsync it, then rename(2) over the target (atomic on POSIX), then fsync
 * the containing directory so the rename itself is durable. A SIGKILL at
 * any instant leaves the complete old file or the complete new file.
 */
export function atomicWriteFile(path, text) {
  const tmp = `${path}.tmp.${process.pid}`;
  let fd = null;
  try {
    fd = openSync(tmp, "w");
    writeSync(fd, text);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmp, path);
    const dirFd = openSync(dirname(path), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}

/** Persist the observation row (one JSON object per line, fsync'd append). */
export function appendObservation(paths, row) {
  appendLineAtomic(paths.observations, row);
}

/** Persist a decision audit entry (one JSON object per line, fsync'd append). */
export function appendAudit(paths, entry) {
  appendLineAtomic(paths.audit, entry);
}

/** Save the runtime snapshot atomically (priors for the next run). */
export function saveRuntime(paths, runtime) {
  atomicWriteFile(paths.runtime, JSON.stringify(runtime, null, 2) + "\n");
}

/** Read back the last N observation rows (for the report). */
export function readObservations(paths, limit = 50) {
  if (!existsSync(paths.observations)) return [];
  const lines = readFileSync(paths.observations, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l));
}
