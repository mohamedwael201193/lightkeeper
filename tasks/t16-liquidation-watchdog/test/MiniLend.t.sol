// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MiniLend.sol";

/// @notice Unit tests for MiniLend health-factor math — the exact math the
///         T16 watchdog reads on-chain. No mocks: a real contract instance.
contract MiniLendTest is Test {
    MiniLend pool;
    address user = address(0xBEEF);

    int256 constant P2 = 200_000_000; // $2.00, 8dp
    uint256 constant DEPOSIT = 0.002 ether; // 2e15 wei

    function setUp() public {
        pool = new MiniLend(P2);
        vm.deal(address(pool), 10 ether); // pool liquidity for borrow payouts
        vm.deal(user, 10 ether);
    }

    function _openPosition() internal {
        vm.prank(user);
        pool.deposit{value: DEPOSIT}();
        vm.prank(user);
        pool.borrow(200_000); // $0.002 of debt
    }

    function testHealthyPosition() public {
        _openPosition();
        // collUsd = 0.002*2 = $0.004 (400_000); HF = 400000*0.8/200000 = 1.6
        assertEq(pool.healthFactor(user), 1.6 ether);
    }

    function testWarningZoneOnPriceDrop() public {
        _openPosition();
        pool.setPrice(150_000_000); // $1.50
        // collUsd = $0.003 (300_000); HF = 300000*0.8/200000 = 1.2
        assertEq(pool.healthFactor(user), 1.2 ether);
    }

    function testCriticalZoneOnDeepDrop() public {
        _openPosition();
        pool.setPrice(100_000_000); // $1.00
        // collUsd = $0.002 (200_000); HF = 200000*0.8/200000 = 0.8
        assertEq(pool.healthFactor(user), 0.8 ether);
    }

    function testDebtFreeIsInfinite() public {
        vm.prank(user);
        pool.deposit{value: DEPOSIT}();
        assertEq(pool.healthFactor(user), type(uint256).max);
    }

    function testBorrowRevertsWhenHfBelowOne() public {
        vm.prank(user);
        pool.deposit{value: DEPOSIT}();
        vm.prank(user);
        vm.expectRevert("HF<1: borrow too large");
        pool.borrow(400_000); // $0.004 debt vs $0.004*0.8 collateral value
    }

    function testOnlyOracleCanSetPrice() public {
        vm.prank(user);
        vm.expectRevert("not oracle");
        pool.setPrice(100_000_000);
    }

    function testRepayRestoresHealth() public {
        _openPosition();
        pool.setPrice(150_000_000); // HF 1.2 (warning)
        // repay $0.0004 of debt: debt' = 160_000 -> HF = 300000*0.8/160000 = 1.5
        uint256 repayWei = (uint256(40_000) * 1e18) / 150_000_000;
        vm.prank(user);
        pool.repay{value: repayWei}();
        // integer truncation in the test-side wei conversion costs a fraction
        // of a wei of repay value — assert the restore within a tiny epsilon
        assertApproxEqAbs(pool.healthFactor(user), 1.5 ether, 1e13);
    }

    function testAccountDataSnapshot() public {
        _openPosition();
        (uint256 c, uint256 d, uint256 hf, int256 p, uint256 lt) = pool.getUserAccountData(user);
        assertEq(c, 400_000);
        assertEq(d, 200_000);
        assertEq(hf, 1.6 ether);
        assertEq(p, P2);
        assertEq(lt, 8000);
    }

    function testLiquidationRequiresHfBelowOne() public {
        _openPosition();
        vm.prank(user);
        vm.expectRevert("position healthy");
        pool.liquidate(user, 100_000);
    }
}
