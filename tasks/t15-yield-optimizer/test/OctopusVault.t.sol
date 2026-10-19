// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/OctopusVault.sol";

/// @notice Unit tests for OctopusVault rate math. TESTNET MECHANICS DEMONSTRATION ONLY.
contract OctopusVaultTest is Test {
    OctopusVault vault;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        // rate card: 1e13 wei/block, 0 entry, 50bps early exit, 100-block min hold, 0.01 PHRS funding
        vault = new OctopusVault{value: 0.01 ether}("TestVault", 1e13, 0, 50, 100);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    function test_rateAccrual_singleStaker() public {
        vm.prank(alice);
        vault.stake{value: 0.02 ether}();
        vm.roll(block.number + 120);
        uint256 pending = vault.pendingReward(alice);
        // single staker owns 100% of rewards: exactly 120 blocks x 1e13 wei/block
        assertEq(pending, 120 * 1e13, "pending must equal blocks*rate exactly");
    }

    function test_claimPaysExactlyPending() public {
        vm.prank(alice);
        vault.stake{value: 0.02 ether}();
        vm.roll(block.number + 120);
        uint256 pending = vault.pendingReward(alice);
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        vault.claim();
        assertEq(alice.balance - balBefore, pending, "claim delta must equal pending view");
        assertEq(vault.pendingReward(alice), 0, "pending must reset after claim");
    }

    function test_proRataSplit_twoStakers() public {
        vm.prank(alice);
        vault.stake{value: 0.03 ether}();
        vm.prank(bob);
        vault.stake{value: 0.01 ether}(); // bob joins later, same block
        vm.roll(block.number + 100);
        uint256 pa = vault.pendingReward(alice);
        uint256 pb = vault.pendingReward(bob);
        // 75/25 split of 100 blocks x 1e13
        assertEq(pa, (100 * 1e13 * 3) / 4, "alice 75%");
        assertEq(pb, (100 * 1e13) / 4, "bob 25%");
        assertEq(pa + pb, 100 * 1e13, "no leakage");
    }

    function test_rewardPoolCap_neverOverpromises() public {
        // tiny funding: 100 blocks of runway
        OctopusVault thin = new OctopusVault{value: 100 * 1e13}("Thin", 1e13, 0, 0, 0);
        vm.prank(alice);
        thin.stake{value: 0.02 ether}();
        vm.roll(block.number + 10_000); // far beyond runway
        uint256 pending = thin.pendingReward(alice);
        assertEq(pending, 100 * 1e13, "rewards capped at funded pool");
        // claim() triggers _update(), which drains the pool to exactly zero
        vm.prank(alice);
        thin.claim();
        assertEq(thin.rewardPool(), 0, "pool fully drained, nothing more promised");
        assertEq(thin.runwayBlocks(), 0, "runway exhausted");
    }

    function test_entryFee_goesToRewardPool() public {
        OctopusVault feeVault = new OctopusVault{value: 0.01 ether}("Fee", 1e13, 100, 0, 0);
        uint256 poolBefore = feeVault.rewardPool();
        vm.prank(alice);
        feeVault.stake{value: 0.02 ether}();
        assertEq(feeVault.staked(alice), 0.02 ether - 0.0002 ether, "1% entry fee on stake");
        assertEq(feeVault.rewardPool(), poolBefore + 0.0002 ether, "fee funds the pool");
    }

    function test_earlyExitFee_vs_noFeeAfterHold() public {
        vm.prank(alice);
        vault.stake{value: 0.02 ether}();
        // early withdraw at +50 blocks (< 100 min hold): 50 bps fee
        vm.roll(block.number + 50);
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        vault.withdraw(0.02 ether);
        uint256 fee = 0.02 ether * 50 / 10000;
        // payout = principal - fee + pending(50 blocks x 1e13)
        assertEq(alice.balance - balBefore, 0.02 ether - fee + 50 * 1e13, "early exit pays fee");
    }

    function test_noFeeAfterMinHold() public {
        vm.prank(alice);
        vault.stake{value: 0.02 ether}();
        vm.roll(block.number + 100); // exactly min hold reached
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        vault.withdraw(0.02 ether);
        assertEq(alice.balance - balBefore, 0.02 ether + 100 * 1e13, "no exit fee after hold");
    }

    function test_viewFunctions_matchImmutableRateCard() public {
        assertEq(vault.rewardPerBlock(), 1e13);
        assertEq(vault.entryFeeBps(), 0);
        assertEq(vault.exitFeeBps(), 50);
        assertEq(vault.minHoldBlocks(), 100);
        assertEq(vault.rewardPool(), 0.01 ether);
    }
}
