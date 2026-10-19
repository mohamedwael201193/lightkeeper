// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BatchDistributor.sol";
import "../src/RevertingReceiver.sol";

/// @notice Minimal ERC20 used ONLY as a test fixture (never deployed to a network).
contract TestERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals = 18;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external virtual returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amt, "allowance");
        allowance[from][msg.sender] = a - amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

/// @notice A token whose transferFrom always reverts — isolates ERC20 partial failure.
contract FailingERC20 is TestERC20 {
    function transferFrom(address, address, uint256) external pure override returns (bool) {
        revert("always fails");
    }
}

contract BatchDistributorTest is Test {
    event Distributed(address indexed recipient, uint256 amount, bool success);

    BatchDistributor dist;
    RevertingReceiver refuser;
    TestERC20 token;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() external {
        dist = new BatchDistributor();
        refuser = new RevertingReceiver();
        token = new TestERC20();
        token.mint(address(this), 100 ether);
    }

    // ---------- native distribution ----------

    function test_distributeNative_happyPath() external {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = alice; a[0] = 0.001 ether;
        r[1] = bob;   a[1] = 0.002 ether;

        vm.expectEmit(true, false, false, true);
        emit Distributed(alice, 0.001 ether, true);
        dist.distributeNative{value: 0.003 ether}(r, a);

        assertEq(alice.balance, 0.001 ether);
        assertEq(bob.balance, 0.002 ether);
        assertEq(address(dist).balance, 0, "no escrow left behind");
    }

    function test_distributeNative_partialFailure_isolated() external {
        address[] memory r = new address[](3);
        uint256[] memory a = new uint256[](3);
        r[0] = alice;            a[0] = 0.001 ether;
        r[1] = address(refuser); a[1] = 0.001 ether; // refuses
        r[2] = bob;              a[2] = 0.001 ether;

        vm.expectEmit(true, false, false, true);
        emit Distributed(address(refuser), 0.001 ether, false);
        dist.distributeNative{value: 0.003 ether}(r, a);

        assertEq(alice.balance, 0.001 ether, "before refuser paid");
        assertEq(bob.balance, 0.001 ether, "after refuser paid");
    }

    function test_distributeNative_refundsRemainder() external {
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        r[0] = alice; a[0] = 0.001 ether;

        uint256 before = address(this).balance;
        dist.distributeNative{value: 0.005 ether}(r, a);
        assertEq(address(this).balance, before - 0.001 ether, "remainder refunded");
    }

    // ---------- validation ----------

    function test_revertsOnLengthMismatch() external {
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](2);
        r[0] = alice;
        vm.expectRevert(BatchDistributor.LengthMismatch.selector);
        dist.distributeNative{value: 1 ether}(r, a);
    }

    function test_revertsOnEmptyBatch() external {
        vm.expectRevert(BatchDistributor.EmptyBatch.selector);
        dist.distributeNative(new address[](0), new uint256[](0));
    }

    function test_revertsOnChunkTooLarge() external {
        address[] memory r = new address[](201);
        uint256[] memory a = new uint256[](201);
        for (uint256 i = 0; i < 201; i++) {
            r[i] = address(uint160(0x1000 + i));
            a[i] = 1;
        }
        vm.expectRevert(BatchDistributor.ChunkTooLarge.selector);
        dist.distributeNative{value: 201}(r, a);
    }

    function test_revertsOnZeroAddress() external {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = alice; a[0] = 1;
        r[1] = address(0); a[1] = 1;
        vm.expectRevert(BatchDistributor.ZeroAddress.selector);
        dist.distributeNative{value: 2}(r, a);
    }

    function test_revertsOnDuplicateRecipient() external {
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = alice; a[0] = 1;
        r[1] = alice; a[1] = 1;
        vm.expectRevert(BatchDistributor.DuplicateRecipient.selector);
        dist.distributeNative{value: 2}(r, a);
    }

    function test_revertsOnInsufficientValue() external {
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        r[0] = alice; a[0] = 0.01 ether;
        vm.expectRevert(BatchDistributor.InsufficientValue.selector);
        dist.distributeNative{value: 0.005 ether}(r, a);
    }

    // ---------- ERC20 ----------

    function test_distributeERC20_happyPath() external {
        token.approve(address(dist), 0.03 ether);
        address[] memory r = new address[](2);
        uint256[] memory a = new uint256[](2);
        r[0] = alice; a[0] = 0.01 ether;
        r[1] = bob;   a[1] = 0.02 ether;

        dist.distributeERC20(address(token), r, a);
        assertEq(token.balanceOf(alice), 0.01 ether);
        assertEq(token.balanceOf(bob), 0.02 ether);
    }

    function test_distributeERC20_partialFailure_isolated() external {
        FailingERC20 bad = new FailingERC20();
        bad.mint(address(this), 1 ether);
        bad.approve(address(dist), 1 ether);

        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        r[0] = alice; a[0] = 0.01 ether;

        vm.expectEmit(true, false, false, true);
        emit Distributed(alice, 0.01 ether, false);
        // batch must NOT revert — the failure is recorded in the event
        dist.distributeERC20(address(bad), r, a);
    }

    function test_distributeERC20_revertsOnZeroToken() external {
        address[] memory r = new address[](1);
        uint256[] memory a = new uint256[](1);
        r[0] = alice; a[0] = 1;
        vm.expectRevert(BatchDistributor.ZeroToken.selector);
        dist.distributeERC20(address(0), r, a);
    }

    receive() external payable {}
}
