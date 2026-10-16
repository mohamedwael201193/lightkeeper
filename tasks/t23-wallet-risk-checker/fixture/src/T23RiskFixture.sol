// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title T23RiskFixture
/// @notice T23 TEST FIXTURE — Atlantic testnet demonstration contract.
/// @dev Deployed ONLY so the T23 Wallet Risk Checker has a real, fresh,
///      unverified contract to demonstrate its heuristic flag mechanics on.
///      It is NOT malicious and must never be presented as a "risky"
///      accusation: the report flags are properties of its on-chain
///      footprint (new, unverified, tiny interaction graph), every one of
///      them labeled HEURISTIC in the report.
contract T23RiskFixture {
    uint256 public x;

    // Accept native PHRS so the demo can fund the fixture (freshly-funded pattern).
    receive() external payable {}

    function set(uint256 v) external {
        x = v;
    }
}
