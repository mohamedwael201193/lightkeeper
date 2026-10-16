// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/KeeperPing.sol";

contract DeployKeeperPing is Script {
    function run() external {
        vm.startBroadcast();
        new KeeperPing();
        vm.stopBroadcast();
    }
}
