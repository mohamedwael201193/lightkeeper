// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MiniLend — minimal lending pool with real on-chain health-factor math
/// @notice Built for LIGHTKEEPER T16 (Liquidation Watchdog) on Pharos Atlantic.
///         Collateral: native PHRS (wei). Debt: USD-denominated, 8 decimals
///         (Chainlink-style). The price feed is operator-updated ON-CHAIN —
///         every price move is a real state change, auditable in events.
///         Health factor (Aave-style): HF = (collateralUSD * LT) / debtUSD,
///         1e18 == 1.0. Returns type(uint256).max when the position is debt-free.
contract MiniLend {
    uint256 public constant HF_SCALE = 1e18; // 1.0
    uint256 public constant LT_BPS = 8000; // 80% liquidation threshold
    uint256 public constant BONUS_BPS = 500; // 5% liquidation bonus
    uint256 private constant PHRS_DEC = 1e18;
    uint256 private constant BPS_DENOM = 10000;

    int256 public price; // USD per PHRS, 8 decimals
    address public oracle; // authorized price updater

    struct Position {
        uint256 collateralWei;
        uint256 debtUsd; // 8 decimals
    }
    mapping(address => Position) public positions;

    event PriceUpdated(int256 oldPrice, int256 newPrice, uint256 blockNumber);
    event Deposited(address indexed user, uint256 amountWei);
    event Borrowed(address indexed user, uint256 usdAmount, uint256 phrsOut);
    event Repaid(address indexed user, uint256 usdApplied, uint256 phrsIn);
    event Withdrawn(address indexed user, uint256 amountWei);
    event Liquidated(address indexed user, address indexed liquidator, uint256 repayUsd, uint256 seizeWei);

    constructor(int256 initialPriceUsd8dp) {
        require(initialPriceUsd8dp > 0, "bad price");
        price = initialPriceUsd8dp;
        oracle = msg.sender;
    }

    /// @notice Real on-chain state change: moves the oracle price, which moves every HF.
    function setPrice(int256 newPriceUsd8dp) external {
        require(msg.sender == oracle, "not oracle");
        require(newPriceUsd8dp > 0, "bad price");
        int256 old = price;
        price = newPriceUsd8dp;
        emit PriceUpdated(old, newPriceUsd8dp, block.number);
    }

    function deposit() external payable {
        require(msg.value > 0, "no value");
        positions[msg.sender].collateralWei += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Borrow `usdAmount` (8dp) of PHRS value against collateral.
    function borrow(uint256 usdAmount) external {
        require(usdAmount > 0, "no amount");
        uint256 phrsOut = (usdAmount * PHRS_DEC) / uint256(price);
        require(address(this).balance >= phrsOut, "pool illiquid");
        positions[msg.sender].debtUsd += usdAmount;
        require(healthFactor(msg.sender) >= HF_SCALE, "HF<1: borrow too large");
        (bool ok,) = msg.sender.call{value: phrsOut}("");
        require(ok, "send failed");
        emit Borrowed(msg.sender, usdAmount, phrsOut);
    }

    function repay() external payable {
        require(msg.value > 0, "no value");
        Position storage p = positions[msg.sender];
        uint256 usdValue = (msg.value * uint256(price)) / PHRS_DEC;
        uint256 applied = usdValue > p.debtUsd ? p.debtUsd : usdValue;
        p.debtUsd -= applied;
        emit Repaid(msg.sender, applied, msg.value);
    }

    function withdraw(uint256 amountWei) external {
        Position storage p = positions[msg.sender];
        require(amountWei <= p.collateralWei, "insufficient collateral");
        p.collateralWei -= amountWei;
        require(p.debtUsd == 0 || healthFactor(msg.sender) >= HF_SCALE, "HF<1 after withdraw");
        (bool ok,) = msg.sender.call{value: amountWei}("");
        require(ok, "send failed");
        emit Withdrawn(msg.sender, amountWei);
    }

    /// @notice Anyone may liquidate a position whose HF dropped below 1.0.
    function liquidate(address user, uint256 repayUsd) external payable {
        require(healthFactor(user) < HF_SCALE, "position healthy");
        uint256 phrsIn = (repayUsd * PHRS_DEC) / uint256(price);
        require(msg.value >= phrsIn, "insufficient repay value");
        Position storage p = positions[user];
        uint256 applied = repayUsd > p.debtUsd ? p.debtUsd : repayUsd;
        p.debtUsd -= applied;
        uint256 seizeWei = (phrsIn * (BPS_DENOM + BONUS_BPS)) / BPS_DENOM;
        uint256 seized = seizeWei > p.collateralWei ? p.collateralWei : seizeWei;
        p.collateralWei -= seized;
        (bool ok,) = msg.sender.call{value: seized}("");
        require(ok, "seize failed");
        emit Liquidated(user, msg.sender, applied, seized);
    }

    /// @notice Collateral value in USD (8 decimals).
    function collateralUsd(address user) public view returns (uint256) {
        return (positions[user].collateralWei * uint256(price)) / PHRS_DEC;
    }

    /// @notice Aave-style health factor. 1e18 == 1.0. Max uint when debt-free.
    function healthFactor(address user) public view returns (uint256) {
        Position memory p = positions[user];
        if (p.debtUsd == 0) return type(uint256).max;
        return (collateralUsd(user) * LT_BPS * HF_SCALE) / (p.debtUsd * BPS_DENOM);
    }

    /// @notice Aave-style account snapshot for off-chain watchers.
    function getUserAccountData(address user)
        external
        view
        returns (uint256 collateralUsdAmt, uint256 debtUsdAmt, uint256 hf, int256 currentPrice, uint256 thresholdBps)
    {
        Position memory p = positions[user];
        return (collateralUsd(user), p.debtUsd, healthFactor(user), price, LT_BPS);
    }
}
