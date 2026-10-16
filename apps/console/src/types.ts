export interface LampActivity {
  title: string;
  detail: string;
  at: string;
  link?: string;
}

export interface RunLogFile {
  name: string;
  tail: string;
}

/** The full evidence.json object as harvested (shape varies per task). */
export type EvidenceBlob = Record<string, unknown> | null;

export interface Lamp {
  id: string;
  slug: string;
  name: string;
  tier: string;
  points: number;
  toolkit: string;
  dir: string | null;
  status: "shipped" | "in-progress";
  has_task_yaml: boolean;
  has_readme: boolean;
  readme_summary: string;
  /** Full README as markdown with the HTML banner stripped — rendered with a markdown renderer. */
  readme_markdown: string;
  /** Raw task.yaml text (01 Configuration). */
  task_config_text: string | null;
  /** Raw policy.yaml text (01 Configuration). */
  policy_yaml_text: string | null;
  /** Tails of real run-log files (03 History). */
  run_log_files: RunLogFile[];
  has_evidence_json: boolean;
  /** Raw evidence.json (02 Execution trace plumbing). */
  evidence: EvidenceBlob;
  txs: string[];
  explorer_links: string[];
  has_submission: boolean;
  submission_status: string;
  activity: LampActivity[];
}

export interface LampsData {
  generated_at: string;
  source: string;
  total_points: number;
  lamps_lit: number;
  points_secured: number;
  tasks: Lamp[];
}

export const EXPLORER = "https://atlantic.pharosscan.xyz";
export const ARENA_BOARD = "https://pharos-agent-arena.vercel.app/tasks";
export const ARENA_PORTAL = "https://ai.pharos.xyz/";

/** Pharos Atlantic testnet — the only chain the console ever names. */
export const ATLANTIC = {
  chainId: 688689,
  chainIdHex: "0xA8231", // 688689 in hex — verified
  name: "Pharos Atlantic Testnet",
  rpcUrl: "https://atlantic.dplabs-internal.com",
  explorer: EXPLORER,
  currency: { name: "PHRS", symbol: "PHRS", decimals: 18 },
} as const;

export const arenaTaskUrl = (slug: string) => `${ARENA_BOARD}/${slug}`;
export const taskRoute = (lamp: Lamp) => `#/task/${lamp.slug}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;

export function shortenAddress(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

/** Format a wei hex string as a PHRS amount (4 decimals). */
export function weiToPhrs(weiHex: string): string {
  try {
    const wei = BigInt(weiHex);
    const base = 10n ** 18n;
    const int = wei / base;
    const frac = wei % base;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
    return `${int.toString()}.${fracStr}`;
  } catch {
    return "—";
  }
}
