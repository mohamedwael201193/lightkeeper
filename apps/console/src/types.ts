export interface LampActivity {
  title: string;
  detail: string;
  at: string;
  link?: string;
}

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
  has_evidence_json: boolean;
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

export const arenaTaskUrl = (slug: string) => `${ARENA_BOARD}/${slug}`;
export const taskRoute = (lamp: Lamp) => `#/task/${lamp.slug}`;
