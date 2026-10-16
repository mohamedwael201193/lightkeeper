// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DryRunProbe — a minimal probe contract for T08 "Dry-Run Executor".
/// @notice Deployed ONCE on Pharos Atlantic testnet (chain 688689) as the
///         target of the two live dry-run scenarios:
///           - `boom()` ALWAYS reverts with a known reason  -> scenario A (predicted REVERT)
///           - `ping()` always succeeds, bumps `count`      -> scenario B (predicted SUCCESS)
contract DryRunProbe {
    uint256 public count;
    address public owner;

    event Pinged(address indexed caller, uint256 newCount);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Reverts unconditionally with a stable, parseable reason string.
    function boom() external pure returns (uint256) {
        revert("DryRunProbe: forced boom");
    }

    /// @notice Succeeds unconditionally; mutates state so receipts are verifiable.
    function ping() external returns (uint256) {
        count += 1;
        emit Pinged(msg.sender, count);
        return count;
    }
}
