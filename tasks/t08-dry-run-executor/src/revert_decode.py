"""T08 Dry-Run Executor — revert reason decoding.

Decodes EVM revert payloads WITHOUT inventing reasons:
- Error(string)  -> 0x08c379a0
- Panic(uint256) -> 0x4e487b71 (+ Solidity panic code table)
- Custom errors  -> reported as selector hex, never guessed

Also parses `cast` stderr text to extract the human-readable reason.
Pure functions; no network, no signer.
"""

PANIC_CODES = {
    0x00: "generic compiler-inserted panic",
    0x01: "assert(false) failed",
    0x11: "arithmetic overflow or underflow",
    0x12: "division or modulo by zero",
    0x21: "enum value out of bounds",
    0x22: "incorrectly encoded storage byte array",
    0x31: "pop() on empty array",
    0x32: "out-of-bounds or negative array index",
    0x41: "memory overflow (allocation too large)",
    0x51: "zero-initialized function type called",
}

ERROR_STRING_SELECTOR = "08c379a0"
PANIC_SELECTOR = "4e487b71"


def decode_revert_data(data_hex: str) -> str:
    """Decode a raw revert data hex string into a human-readable reason.

    Never invents a reason: unknown selectors are returned as raw selector hex.
    """
    h = data_hex.strip().lower()
    if h.startswith("0x"):
        h = h[2:]
    if len(h) < 8:
        return f"empty/short revert data (0x{h})"
    selector = h[:8]
    payload = h[8:]

    if selector == ERROR_STRING_SELECTOR:
        # Error(string): offset(32) + length(32) + utf8 bytes
        try:
            if len(payload) < 128:
                return "Error(string): malformed payload"
            length = int(payload[64:128], 16)
            raw = bytes.fromhex(payload[128:128 + length * 2])
            return raw.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001 - decode must never crash the pipeline
            return f"Error(string): undecodable payload ({exc})"

    if selector == PANIC_SELECTOR:
        try:
            code = int(payload[:64], 16)
            label = PANIC_CODES.get(code, "unknown panic code")
            return f"Panic(0x{code:02x}): {label}"
        except Exception as exc:  # noqa: BLE001
            return f"Panic: undecodable code ({exc})"

    return f"custom error, selector 0x{selector} (reason not decoded; not invented)"


def extract_reason_from_cast_stderr(stderr: str) -> str:
    """Extract the revert reason from `cast estimate`/`cast call` stderr text.

    Handles both forms:
      - 'execution reverted: <reason>'  (human-readable passthrough)
      - 'execution reverted: 0x08c379a0...' (raw data -> decoded)
    Returns '' if no revert marker is found.
    """
    for line in stderr.splitlines():
        low = line.lower()
        if "execution reverted" not in low:
            continue
        # split on the marker, keep what follows
        idx = low.find("execution reverted")
        tail = line[idx + len("execution reverted"):].lstrip(": ").strip()
        if not tail:
            return "reverted with no reason"
        if tail.startswith("0x") and all(c in "0123456789abcdefABCDEFx" for c in tail):
            return decode_revert_data(tail)
        return tail
    return ""


if __name__ == "__main__":
    import sys
    print(decode_revert_data(sys.argv[1]))
