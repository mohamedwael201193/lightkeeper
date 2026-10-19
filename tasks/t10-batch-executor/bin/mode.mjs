// Mode selection for T10 Batch Executor — mirrors the SkillEngine airdrop reference:
//
//   ≤ 10 recipients   → "simple"       sequential transfers, no contract needed
//   11–200            → "single-batch" one Distributor contract call
//   > 200             → "multi-batch"  chunked Distributor calls (chunk ≤ 200)

export const SIMPLE_MAX = 10;
export const SINGLE_BATCH_MAX = 200; // also the on-chain MAX_CHUNK

export function selectMode(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`invalid recipient count: ${count}`);
  }
  if (count <= SIMPLE_MAX) return "simple";
  if (count <= SINGLE_BATCH_MAX) return "single-batch";
  return "multi-batch";
}

/** Split a recipient list into on-chain chunks (each ≤ maxChunk). */
export function chunkRecipients(recipients, maxChunk = SINGLE_BATCH_MAX) {
  if (recipients.length === 0) throw new Error("empty recipient list");
  if (maxChunk < 1 || maxChunk > SINGLE_BATCH_MAX) {
    throw new Error(`invalid chunk size: ${maxChunk}`);
  }
  const chunks = [];
  for (let i = 0; i < recipients.length; i += maxChunk) {
    chunks.push(recipients.slice(i, i + maxChunk));
  }
  return chunks;
}

/**
 * Full plan: mode + chunks for a recipient list.
 * `demoChunkSize` lets a live demo exercise the multi-batch path with a
 * small list (honestly labeled in evidence) without paying for >200 dust sends.
 */
export function planBatch(recipients, demoChunkSize = null) {
  const count = recipients.length;
  const mode = selectMode(count);
  let chunkSize = SINGLE_BATCH_MAX;
  if (mode === "multi-batch") {
    chunkSize = demoChunkSize ?? SINGLE_BATCH_MAX;
  }
  const chunks = chunkRecipients(recipients, chunkSize);
  return { mode, count, chunkSize, chunks: chunks.map((c) => c.length) };
}
