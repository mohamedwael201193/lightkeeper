/**
 * @lightkeeper/value-format (L4) — human formatting for amounts/addresses.
 *
 * Rules, enforced here:
 *  - Amounts are bigint-only. Decimal strings are parsed exactly
 *    (parseDecimalToBigint) — never through float.
 *  - Decimals are a parameter, never assumed.
 *  - Every formatted amount keeps its raw form alongside
 *    (FormattedAmount.raw), so evidence can always cite the exact value.
 *  - No naked numbers: formatAmount returns a typed object, not a bare string.
 */

export interface FormattedAmount {
  /** Human-readable text, e.g. "1.5 PHRS". */
  text: string;
  /** The exact raw integer value, as a decimal string — kept alongside. */
  raw: string;
  symbol?: string;
}

/**
 * Parse a decimal amount string into raw integer units, exactly.
 * Throws a plain-language Error when the value does not parse or exceeds
 * `decimals` fractional digits. Never touches float.
 */
export function parseDecimalToBigint(value: string, decimals: number): bigint {
  const s = value.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`"${value}" is not a valid decimal amount.`);
  }
  const [intPart, fracPart = ""] = s.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`"${value}" has more than ${decimals} decimal places.`);
  }
  const base = 10n ** BigInt(decimals);
  return (
    BigInt(intPart) * base +
    BigInt((fracPart + "0".repeat(decimals)).slice(0, decimals))
  );
}

/**
 * Format raw integer units into a human amount. `decimals` must come from
 * the token contract — never assumed. Returns the text AND the raw value.
 */
export function formatAmount(
  raw: bigint | string,
  decimals: number,
  symbol?: string
): FormattedAmount {
  const r = typeof raw === "bigint" ? raw : BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const negative = r < 0n;
  const abs = negative ? -r : r;
  const whole = abs / base;
  const frac = abs % base;
  let text = whole.toString();
  if (frac !== 0n) {
    text += "." + frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  }
  if (negative) text = "-" + text;
  return {
    text: symbol ? `${text} ${symbol}` : text,
    raw: r.toString(),
    ...(symbol ? { symbol } : {}),
  };
}

/** True for 0x-prefixed 40-hex-char addresses. */
export function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** Shorten an address for display: 0x123456…abcd. Throws on non-addresses. */
export function shortAddress(addr: string): string {
  if (!isAddress(addr)) {
    throw new Error(`"${addr}" is not an Ethereum address.`);
  }
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
