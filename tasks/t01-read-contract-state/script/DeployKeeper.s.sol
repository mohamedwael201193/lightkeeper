// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/KeeperRegistry.sol";

/// @notice Deploys KeeperRegistry to Pharos Atlantic (chain 688689).
///         Run:  flock /tmp/lk-nonce.lock forge script script/DeployKeeper.s.sol:DeployKeeper \
///                 --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
contract DeployKeeper is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        // The keeper reads the stone before lighting the lamp:
        // 3 lamps, 6 decimals — all state seeded in ONE constructor call.
        KeeperRegistry keeper = new KeeperRegistry("Atlantic Deep", 3, 6);
        vm.stopBroadcast();
        console2.log("KeeperRegistry deployed at:", address(keeper));
    }
}
