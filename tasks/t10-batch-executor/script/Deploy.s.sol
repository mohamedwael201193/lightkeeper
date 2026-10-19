// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/BatchDistributor.sol";
import "../src/RevertingReceiver.sol";

/// @notice Deploys BatchDistributor + RevertingReceiver (partial-failure fixture).
///         Usage (from task dir):
///           flock /tmp/lk-nonce.lock forge script script/Deploy.s.sol \
///             --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        BatchDistributor dist = new BatchDistributor();
        console.log("BatchDistributor:", address(dist));

        RevertingReceiver refuser = new RevertingReceiver();
        console.log("RevertingReceiver:", address(refuser));

        vm.stopBroadcast();
    }
}
