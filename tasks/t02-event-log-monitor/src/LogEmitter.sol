// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LogEmitter — minimal event emitter for T02 (Event/Log Monitor)
/// @notice Emits 3 distinct typed events. Deployed on Pharos Atlantic testnet (chain 688689).
/// @dev No funds are handled; all calls are dust-only.
contract LogEmitter {
    /// @dev indexed from; value in plain units; free-form note
    event Ping(address indexed from, uint256 value, string note);
    /// @dev double-indexed transfer-like signal
    event Zap(address indexed sender, address indexed target, uint256 amount);
    /// @dev indexed id + fixed tag + arbitrary payload
    event Marker(uint256 indexed id, bytes32 tag, bytes payload);

    function ping(uint256 value, string calldata note) external {
        emit Ping(msg.sender, value, note);
    }

    function zap(address target, uint256 amount) external {
        emit Zap(msg.sender, target, amount);
    }

    function mark(uint256 id, bytes32 tag, bytes calldata payload) external {
        emit Marker(id, tag, payload);
    }
}
