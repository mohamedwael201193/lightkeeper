/**
 * keccak256.ts — Ethereum Keccak-256 (the ORIGINAL Keccak, 0x01 domain separator,
 * NOT NIST SHA3-256 — they differ and on-chain topics use this one).
 *
 * Dependency-free: the console keeps zero crypto deps, so the 20 task workers
 * share this tiny file instead of pulling in a library. Used to compute event
 * topic0 = keccak256("Transfer(address,address,uint256)") etc. at runtime —
 * never hardcoded, mirroring the T02 Python monitor.
 */
const ROT = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const MASK64 = 0xffffffffffffffffn;

function rotl64(x: bigint, n: number): bigint {
  const s = n % 64;
  if (s === 0) return x;
  return ((x << BigInt(s)) | (x >> BigInt(64 - s))) & MASK64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // θ
    const C: bigint[] = [];
    for (let x = 0; x < 5; x++)
      C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    const D: bigint[] = [];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
    // ρ + π
    const B = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[x + 5 * y], ROT[x + 5 * y]);
    // χ
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        state[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & MASK64) & B[(x + 2) % 5 + 5 * y]);
    // ι
    state[0] ^= RC[round];
  }
}

/** Keccak-256 of raw bytes. */
export function keccak256Bytes(input: Uint8Array): Uint8Array {
  const state = new Array<bigint>(25).fill(0n);
  const blockSize = 136; // 1088-bit rate for 256-bit output
  const padded = new Uint8Array(
    Math.ceil((input.length + 1) / blockSize) * blockSize
  );
  padded.set(input);
  padded[input.length] = 0x01; // original Keccak domain separation
  padded[padded.length - 1] |= 0x80;

  for (let off = 0; off < padded.length; off += blockSize) {
    for (let i = 0; i < blockSize / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++)
        lane |= BigInt(padded[off + i * 8 + b]) << BigInt(8 * b);
      state[i] ^= lane;
    }
    keccakF1600(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

/** Keccak-256 of a UTF-8 string, returned as 0x-prefixed hex (an event topic0). */
export function keccak256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const hash = keccak256Bytes(bytes);
  return "0x" + Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
