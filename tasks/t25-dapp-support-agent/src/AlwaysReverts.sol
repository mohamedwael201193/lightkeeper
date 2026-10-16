// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice T25 diagnostic fixture: a contract whose constructor ALWAYS
/// reverts, used ONLY to generate a REAL, labeled on-chain deployment
/// failure for the support agent to diagnose. Pharos Atlantic testnet only.
contract AlwaysReverts {
    constructor() {
        revert("SUPPORT-DIAG: constructor always reverts");
    }
}
