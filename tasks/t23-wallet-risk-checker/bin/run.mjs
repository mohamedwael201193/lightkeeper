#!/usr/bin/env node
// T23 bin entry: asserts the Atlantic chain, then runs the checker.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const check = join(dir, "..", "src", "check.mjs");
const r = spawnSync(process.execPath, [check, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
