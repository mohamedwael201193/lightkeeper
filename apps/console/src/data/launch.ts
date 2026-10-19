/**
 * Staged public launch control.
 *
 * Only the task IDs listed here are publicly open. Every other lamp renders
 * as "Coming soon" to the public — its card is locked and its task page shows
 * a placeholder. NOTHING else changes: all built work (try modules, evidence,
 * pages) stays exactly as it is, and founder mode (?founder=1) bypasses the
 * lock completely so videos can be filmed and submissions prepared.
 *
 * To open more lamps later, just add their IDs to this array — one line,
 * no other change needed. Example: open T09 and T10 → add "T09", "T10".
 */
export const PUBLICLY_OPEN_TASK_IDS: string[] = [
  "T01",
  "T02",
  "T03",
  "T04",
  "T05",
  "T06",
  "T07",
  "T08",
  "T09",
  "T10",
  "T11",
  "T12",
  "T13",
  "T14",
  "T15",
  "T16",
];

export function isTaskPubliclyOpen(taskId: string): boolean {
  return PUBLICLY_OPEN_TASK_IDS.includes(taskId);
}
