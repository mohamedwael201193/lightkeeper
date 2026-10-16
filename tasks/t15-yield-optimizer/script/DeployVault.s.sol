// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/OctopusVault.sol";

/// @notice Deploys the two T15 OctopusVaults to Pharos Atlantic (chain 688689).
///         TESTNET MECHANICS DEMONSTRATION ONLY — rates stated here are the on-chain rate card.
///         Vault A "Kelp"   : low-fee lane  — 1e13 wei/block, 0 bps entry, 50 bps early-exit, 100-block min hold
///         Vault B "Kraken" : high-rate lane — 2.5e13 wei/block, 100 bps entry, 100 bps early-exit, 400-block min hold
///         Each vault is funded with 0.01 PHRS of rewards at deploy (constructor payable).
///         Run:  flock /tmp/lk-nonce.lock forge script script/DeployVault.s.sol:DeployVault \
///                 --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
contract DeployVault is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        OctopusVault vaultA = new OctopusVault{value: 0.01 ether}(
            "OctopusVault-Kelp", 1e13, 0, 50, 100
        );
        console2.log("VaultA Kelp deployed at:", address(vaultA));

        OctopusVault vaultB = new OctopusVault{value: 0.01 ether}(
            "OctopusVault-Kraken", 2.5e13, 100, 100, 400
        );
        console2.log("VaultB Kraken deployed at:", address(vaultB));

        vm.stopBroadcast();
    }
}
