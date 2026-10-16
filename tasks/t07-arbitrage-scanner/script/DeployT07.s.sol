// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockToken.sol";
import "../src/ArbPool.sol";

/// @notice Deploys the three T07 arbitrage venues on Pharos Atlantic testnet:
///         WPHRS (test wrapped native), TKB (test USD), and three ArbPool
///         contracts seeded with deliberately different reserve ratios so
///         real on-chain spreads exist for the scanner to measure.
///         Broadcasts with the shared deployer key; dust amounts only.
contract DeployT07 is Script {
    function run() external {
        vm.startBroadcast();

        MockToken wphrs = new MockToken("Wrapped PHRS (T07 test)", "WPHRS");
        MockToken tkb = new MockToken("Test USD (T07 test)", "TKB");

        ArbPool poolA = new ArbPool(address(wphrs), address(tkb));
        ArbPool poolB = new ArbPool(address(wphrs), address(tkb));
        ArbPool poolC = new ArbPool(address(wphrs), address(tkb));

        // Mint test liquidity to the deployer (dust-scale).
        wphrs.mint(msg.sender, 10000 ether);
        tkb.mint(msg.sender, 10000 ether);

        // Approve all three pools to pull seed liquidity.
        wphrs.approve(address(poolA), type(uint256).max);
        tkb.approve(address(poolA), type(uint256).max);
        wphrs.approve(address(poolB), type(uint256).max);
        tkb.approve(address(poolB), type(uint256).max);
        wphrs.approve(address(poolC), type(uint256).max);
        tkb.approve(address(poolC), type(uint256).max);

        // Seed with different prices (TKB per WPHRS):
        //   Pool A: 1000 / 1000 -> 1.0000  (reference venue)
        //   Pool B: 1000 /  980 -> 0.9800  (WPHRS cheap  -> buy leg)
        //   Pool C: 1000 / 1020 -> 1.0200  (WPHRS dear   -> sell leg)
        poolA.seed(1000 ether, 1000 ether);
        poolB.seed(1000 ether, 980 ether);
        poolC.seed(1000 ether, 1020 ether);

        vm.stopBroadcast();

        console.log("WPHRS:", address(wphrs));
        console.log("TKB:  ", address(tkb));
        console.log("PoolA:", address(poolA));
        console.log("PoolB:", address(poolB));
        console.log("PoolC:", address(poolC));
    }
}
