// SPDX-License-Identifier: MIT
// KeeperPing — T12 "Skill + Chain MCP Flow" composition target.
// A minimal state contract whose pingCount() gives the skill engine a REAL
// on-chain state value to read before, and verify after, each composed run.
pragma solidity ^0.8.24;

contract KeeperPing {
    address public keeper;
    uint256 public pingCount;
    mapping(address => uint256) public pings;

    event Ping(address indexed caller, uint256 count, uint256 value);

    constructor() {
        keeper = msg.sender;
    }

    function ping() external payable {
        pingCount += 1;
        pings[msg.sender] += 1;
        emit Ping(msg.sender, pingCount, msg.value);
    }
}
