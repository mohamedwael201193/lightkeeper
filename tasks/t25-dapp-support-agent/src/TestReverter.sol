// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Diagnostic fixture for T25 dApp Support Agent.
/// Deployed on Pharos Atlantic testnet ONLY to generate REAL, labeled
/// on-chain failures for the support agent to diagnose. Never fabricated:
/// every "failure" below is a real mined transaction with a real receipt.
contract TestReverter {
    /// F1 fixture: always reverts with a human-readable reason string.
    function boom() external pure {
        revert("SUPPORT-DIAG: intentional revert with reason");
    }

    /// F2 fixture: burns gas in a bounded loop. Callers pass a deliberately
    /// small gas limit so the tx runs OUT OF GAS (gasUsed == gasLimit).
    /// Each round adds at most 0xff, so the accumulator cannot overflow.
    function burn(uint256 rounds) external pure returns (uint256 s) {
        for (uint256 i = 0; i < rounds; i++) {
            s += uint256(keccak256(abi.encode(i))) & 0xff;
        }
    }
}
