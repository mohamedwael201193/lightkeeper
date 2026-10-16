// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SimpleLending — minimal payable supply/borrow pool (T28 venue)
/// @notice Real on-chain mock lending venue. Borrow APY follows a linear
/// utilization curve; supply APY = borrowApy * utilization * (1 - reserve).
/// All figures are computed on-chain from live state.
contract SimpleLending {
    string public name;
    uint256 public totalSupplied;
    uint256 public totalBorrowed;
    uint256 public reserveFactorBps = 1000; // 10% of interest to reserves

    uint256 public constant BASE_BORROW_BPS = 300; // 3.00% at 0% utilization
    uint256 public constant SLOPE_BPS = 1200; // +12.00% at 100% utilization

    mapping(address => uint256) public supplied;
    mapping(address => uint256) public borrowed;

    event Supplied(address indexed user, uint256 amount);
    event SupplyWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);

    constructor(string memory _name) {
        name = _name;
    }

    function utilizationBps() public view returns (uint256) {
        if (totalSupplied == 0) return 0;
        return (totalBorrowed * 10000) / totalSupplied;
    }

    function borrowApyBps() public view returns (uint256) {
        return BASE_BORROW_BPS + (utilizationBps() * SLOPE_BPS) / 10000;
    }

    function supplyApyBps() public view returns (uint256) {
        return (borrowApyBps() * utilizationBps() * (10000 - reserveFactorBps)) / 10000 / 10000;
    }

    function availableLiquidity() external view returns (uint256) {
        return address(this).balance;
    }

    function supply() external payable {
        require(msg.value > 0, "zero supply");
        supplied[msg.sender] += msg.value;
        totalSupplied += msg.value;
        emit Supplied(msg.sender, msg.value);
    }

    function withdrawSupply(uint256 amt) external {
        require(amt > 0 && supplied[msg.sender] >= amt, "bad amount");
        // suppliers cannot withdraw what borrowers currently hold
        require(address(this).balance >= amt, "locked by borrowers");
        supplied[msg.sender] -= amt;
        totalSupplied -= amt;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "send failed");
        emit SupplyWithdrawn(msg.sender, amt);
    }

    function borrow(uint256 amt) external {
        require(amt > 0, "zero borrow");
        require(supplied[msg.sender] >= amt, "exceeds collateral (1x own supply)");
        require(address(this).balance >= amt, "insufficient liquidity");
        borrowed[msg.sender] += amt;
        totalBorrowed += amt;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "send failed");
        emit Borrowed(msg.sender, amt);
    }

    function repay() external payable {
        uint256 b = borrowed[msg.sender];
        require(b > 0, "nothing borrowed");
        uint256 pay = msg.value > b ? b : msg.value;
        borrowed[msg.sender] -= pay;
        totalBorrowed -= pay;
        if (msg.value > pay) {
            (bool ok, ) = msg.sender.call{value: msg.value - pay}("");
            require(ok, "refund failed");
        }
        emit Repaid(msg.sender, pay);
    }

    receive() external payable {}
}
