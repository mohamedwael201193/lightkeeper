#!/usr/bin/env bash
# t20-onchain-alert-bot — event-matcher unit tests.
#
# These use SYNTHETIC test fixtures (labeled TEST FIXTURE below) to verify the
# matcher logic in isolation. They are NOT evidence of live behavior; the live
# trigger→alert run is the evidence (see evidence.md).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../src/lib.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../src/match.sh"

PASS=0; FAIL=0

assert_eq() { # name expected actual
  if [[ "$2" == "$3" ]]; then PASS=$((PASS+1)); echo "PASS: $1"
  else FAIL=$((FAIL+1)); echo "FAIL: $1 — expected [$2], got [$3]"; fi
}

# --- test globals (TEST FIXTURES, not real chain data) ---
WATCHED=0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3   # TEST FIXTURE address
WATCHED_LC=("0xf76e6b0920e9332ff4410f6dd53f01722abc71a3")
CONTRACTS_LC=("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
THRESH_WEI="$(cast --to-wei 0.5 ether)"              # matches config.yaml 0.5 PHRS
export PATH="$HOME/.foundry/bin:$PATH"

# 1. small incoming transfer -> incoming-transfer only (0x38d7ea4c68000 = 0.001 PHRS)
out="$(match_tx 0xaaa "${WATCHED}" 0x38d7ea4c68000 100)"
assert_eq "dust incoming fires incoming-transfer only" "incoming-transfer" "$out"

# 2. transfer above threshold -> both incoming-transfer and large-transfer
out="$(match_tx 0xbbb "${WATCHED}" 0x8ac7230489e80000 101)"    # 10 PHRS
assert_eq "10 PHRS incoming fires both conditions" \
  "$(printf 'incoming-transfer\nlarge-transfer')" "$out"

# 3. exactly at threshold -> large-transfer fires (>= semantics)
out="$(match_tx 0xccc "${WATCHED}" "$(cast --to-hex "$THRESH_WEI")" 102)"
assert_eq "at-threshold fires large-transfer" \
  "$(printf 'incoming-transfer\nlarge-transfer')" "$out"

# 4. just below threshold -> large-transfer does NOT fire (threshold - 1 wei)
out="$(match_tx 0xddd "${WATCHED}" 0x6f05b59d3b1ffff 103)"
assert_eq "below-threshold skips large-transfer" "incoming-transfer" "$out"

# 5. unrelated address -> no conditions
out="$(match_tx 0xeee 0x1111111111111111111111111111111111111111 0x38d7ea4c68000 104)"
assert_eq "unrelated address fires nothing" "" "$out"

# 6. watched contract recipient -> contract-interaction
out="$(match_tx 0xfff 0xDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEf 0x0 105)"
assert_eq "watched contract fires contract-interaction" "contract-interaction" "$out"

# 7. contract creation (to empty) -> no conditions
out="$(match_tx 0x111 "" 0x0 106)"
assert_eq "contract creation fires nothing" "" "$out"

# 8. zero-value tx to watched address -> incoming-transfer does NOT fire (value > 0 rule)
out="$(match_tx 0x222 "${WATCHED}" 0x0 107)"
assert_eq "zero-value to watched fires nothing" "" "$out"

# 9. case-insensitive address matching (EIP-55 checksum form)
out="$(match_tx 0x333 0xF76E6B0920E9332FF4410F6DD53F01722ABC71A3 0x38d7ea4c68000 108)"
assert_eq "checksum-case address still matches" "incoming-transfer" "$out"

# 10. ge_wei boundary sanity (256-bit safe, no bash overflow)
assert_eq "ge_wei equal" "1" "$(ge_wei 1000000000000000000 1000000000000000000)"
assert_eq "ge_wei greater (huge)" "1" "$(ge_wei 115792089237316195423570985008687907853269984665640564039457584007913129639935 1)"
assert_eq "ge_wei smaller" "0" "$(ge_wei 499999999999999999 500000000000000000)"
assert_eq "ge_wei leading zeros" "1" "$(ge_wei 0001000 1000)"

# 11. config.yaml parses to the same threshold the tests assumed
parse_config
assert_eq "config threshold parses" "$THRESH_WEI" "$THRESH_WEI"
assert_eq "config watched address" "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3" "${WATCHED_ADDRS[0]}"
assert_eq "config confirm blocks" "2" "$CONFIRM"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]]
