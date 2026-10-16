// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OctopusVault — minimal native-PHRS staking vault with a REAL, stated, on-chain reward rate.
/// @notice TESTNET MECHANICS DEMONSTRATION ONLY. Rewards are testnet PHRS with zero monetary value.
///         Reward schedule is immutable at deploy: rewardPerBlock, entryFeeBps, exitFeeBps,
///         minHoldBlocks. Rewards are paid ONLY from the pre-funded rewardPool — the contract
///         can never pay more than it holds (see _update cap). All math is on-chain and auditable.
contract OctopusVault {
    // ---- Stated, immutable schedule (the "rate card") ----
    string public name; // set once in constructor
    uint256 public immutable rewardPerBlock; // wei PHRS accrued per block, split pro-rata over stakers
    uint256 public immutable entryFeeBps;    // bps of stake taken as fee (goes to reward pool)
    uint256 public immutable exitFeeBps;     // bps of withdrawal taken as fee if withdrawn early
    uint256 public immutable minHoldBlocks;  // hold this many blocks => exit fee = 0
    uint256 public immutable startBlock;
    address public immutable owner;

    // ---- Live state ----
    uint256 public accRewardPerShare; // x 1e18
    uint256 public lastRewardBlock;
    uint256 public totalStaked;
    uint256 public rewardPool;        // PHRS earmarked for rewards (funded at deploy / by fees)

    mapping(address => uint256) public staked;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public firstStakeBlock;

    event Staked(address indexed user, uint256 gross, uint256 fee, uint256 netStaked);
    event Claimed(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 principalOut, uint256 fee);

    constructor(
        string memory _name,
        uint256 _rewardPerBlock,
        uint256 _entryFeeBps,
        uint256 _exitFeeBps,
        uint256 _minHoldBlocks
    ) payable {
        require(_entryFeeBps <= 1000 && _exitFeeBps <= 1000, "fee cap 10%");
        require(_rewardPerBlock > 0, "rate must be stated");
        name = _name;
        rewardPerBlock = _rewardPerBlock;
        entryFeeBps = _entryFeeBps;
        exitFeeBps = _exitFeeBps;
        minHoldBlocks = _minHoldBlocks;
        startBlock = block.number;
        lastRewardBlock = block.number;
        owner = msg.sender;
        rewardPool = msg.value;
    }

    /// @notice Accrue rewards since lastRewardBlock. Capped by rewardPool: the vault
    ///         can never promise more than it was funded with. Radical honesty, on-chain.
    function _update() internal {
        if (block.number <= lastRewardBlock) return;
        if (totalStaked == 0) {
            lastRewardBlock = block.number;
            return;
        }
        uint256 blocks_ = block.number - lastRewardBlock;
        uint256 reward = blocks_ * rewardPerBlock;
        if (reward > rewardPool) reward = rewardPool;
        rewardPool -= reward;
        accRewardPerShare += (reward * 1e18) / totalStaked;
        lastRewardBlock = block.number;
    }

    /// @notice View: exact claimable amount for `user` at the current block.
    function pendingReward(address user) external view returns (uint256) {
        uint256 acc = accRewardPerShare;
        if (block.number > lastRewardBlock && totalStaked > 0) {
            uint256 reward = (block.number - lastRewardBlock) * rewardPerBlock;
            if (reward > rewardPool) reward = rewardPool;
            acc += (reward * 1e18) / totalStaked;
        }
        uint256 entitled = (staked[user] * acc) / 1e18;
        return entitled > rewardDebt[user] ? entitled - rewardDebt[user] : 0;
    }

    /// @notice View: blocks of reward runway left at the current rate.
    function runwayBlocks() external view returns (uint256) {
        if (rewardPerBlock == 0) return 0;
        return rewardPool / rewardPerBlock;
    }

    /// @notice Stake native PHRS. Entry fee (if any) is added to the reward pool.
    function stake() external payable {
        require(msg.value > 0, "stake something");
        _update();
        uint256 fee = (msg.value * entryFeeBps) / 10000;
        uint256 net = msg.value - fee;
        rewardPool += fee;
        staked[msg.sender] += net;
        totalStaked += net;
        rewardDebt[msg.sender] = (staked[msg.sender] * accRewardPerShare) / 1e18;
        if (firstStakeBlock[msg.sender] == 0) firstStakeBlock[msg.sender] = block.number;
        emit Staked(msg.sender, msg.value, fee, net);
    }

    /// @notice Claim accrued rewards without unstaking.
    function claim() external {
        _update();
        uint256 entitled = (staked[msg.sender] * accRewardPerShare) / 1e18;
        uint256 amount = entitled > rewardDebt[msg.sender] ? entitled - rewardDebt[msg.sender] : 0;
        require(amount > 0, "nothing to claim");
        require(address(this).balance >= amount, "vault underfunded");
        rewardDebt[msg.sender] = entitled;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "claim transfer failed");
        emit Claimed(msg.sender, amount);
    }

    /// @notice Unstake `amount` of principal. Pending rewards are harvested first.
    ///         Early withdrawal (before firstStakeBlock + minHoldBlocks) pays exitFeeBps.
    function withdraw(uint256 amount) external {
        require(amount > 0 && amount <= staked[msg.sender], "bad amount");
        _update();
        // 1) harvest pending rewards first
        uint256 entitled = (staked[msg.sender] * accRewardPerShare) / 1e18;
        uint256 pending = entitled > rewardDebt[msg.sender] ? entitled - rewardDebt[msg.sender] : 0;
        // 2) exit fee only if early
        uint256 fee = 0;
        if (block.number < firstStakeBlock[msg.sender] + minHoldBlocks) {
            fee = (amount * exitFeeBps) / 10000;
            rewardPool += fee;
        }
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (staked[msg.sender] * accRewardPerShare) / 1e18;
        uint256 payout = amount - fee + pending;
        require(address(this).balance >= payout, "vault underfunded");
        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "withdraw transfer failed");
        if (pending > 0) emit Claimed(msg.sender, pending);
        emit Withdrawn(msg.sender, amount - fee, fee);
    }

    /// @notice Owner can top up the reward pool (extends runway). Cannot change the rate.
    function topUp() external payable {
        require(msg.sender == owner, "owner only");
        rewardPool += msg.value;
    }

    receive() external payable {
        revert("use stake()");
    }
}
