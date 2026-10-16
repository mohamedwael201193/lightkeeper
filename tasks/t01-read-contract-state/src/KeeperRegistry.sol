// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KeeperRegistry
/// @notice Minimal typed-state contract for LIGHTKEEPER T01 "Read Contract State".
///         Holds several TYPED state variables so a reader can demonstrate
///         typed reads with human formatting:
///           - uint256 totalLamps      (counter)
///           - address keeper          (owner, set to deployer)
///           - string  realmName       (free text)
///           - uint8   decimals        (human-formatting scale, read — never assumed)
///           - mapping(address => uint256) lampBalanceOf  (balances in lamp-wei)
///           - mapping(uint256 => address) lampBearer     (lamp id -> bearer)
///
///         The constructor seeds ALL state, so this task spends exactly ONE
///         deploy transaction; every read afterwards is free (eth_call).
contract KeeperRegistry {
    uint256 public totalLamps;
    address public keeper;
    string public realmName;
    uint8 public decimals;
    mapping(address => uint256) public lampBalanceOf;
    mapping(uint256 => address) public lampBearer;

    constructor(string memory _realmName, uint256 _totalLamps, uint8 _decimals) {
        require(_totalLamps > 0 && _totalLamps <= 8, "lamps: 1..8");
        realmName = _realmName;
        keeper = msg.sender;
        totalLamps = _totalLamps;
        decimals = _decimals;
        for (uint256 i = 0; i < _totalLamps; i++) {
            lampBearer[i] = msg.sender;
        }
        lampBalanceOf[msg.sender] = _totalLamps * (10 ** _decimals);
    }
}
