// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestToken.sol";

/// @title TestFixture — LIGHTKEEPER T06 saga fixture (Atlantic testnet, dust only)
/// @notice Real on-chain workflow state the saga executor drives; NOT a mock.
/// Steps: lock (pull dust via transferFrom) -> execute(minOut) -> settle.
/// The forced-failure run calls execute() with an IMPOSSIBLE minOut, which the
/// require() below rejects — producing a REAL mined status-0x0 receipt.
/// Compensation: refund() returns locked dust; allowance revoke is a plain
/// ERC20 approve(0) issued by the executor off-chain.
contract TestFixture {
    TestToken public immutable token;

    mapping(address => uint256) public locked;
    mapping(address => bool) public settled;

    event Locked(address indexed user, uint256 amount);
    event Executed(address indexed user, uint256 out);
    event Settled(address indexed user);
    event Refunded(address indexed user, uint256 amount);

    constructor(address tokenAddr) {
        require(tokenAddr != address(0), "TestFixture: zero token");
        token = TestToken(tokenAddr);
    }

    /// @notice Step 2: lock dust into the fixture (requires prior approve).
    function lock(uint256 amount) external {
        require(amount > 0, "TestFixture: zero amount");
        require(token.transferFrom(msg.sender, address(this), amount), "TestFixture: pull failed");
        locked[msg.sender] += amount;
        emit Locked(msg.sender, amount);
    }

    /// @notice Step 3: "execute" the workflow; reverts unless minOut is covered.
    function execute(uint256 minOut) external returns (uint256 out) {
        uint256 bal = locked[msg.sender];
        require(bal > 0, "TestFixture: nothing locked");
        require(minOut <= bal, "TestFixture: minOut exceeds locked balance");
        out = bal;
        emit Executed(msg.sender, out);
    }

    /// @notice Step 4 (success path): mark the workflow settled.
    function settle() external {
        require(locked[msg.sender] > 0, "TestFixture: nothing locked");
        settled[msg.sender] = true;
        emit Settled(msg.sender);
    }

    /// @notice Compensation step: return ALL locked dust to the locker.
    function refund() external {
        uint256 bal = locked[msg.sender];
        locked[msg.sender] = 0;
        settled[msg.sender] = false;
        require(token.transfer(msg.sender, bal), "TestFixture: refund failed");
        emit Refunded(msg.sender, bal);
    }
}
