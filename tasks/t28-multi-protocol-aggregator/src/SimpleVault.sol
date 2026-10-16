// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SimpleVault — minimal payable share vault (T28 venue)
/// @notice Real on-chain mock venue for the LIGHTKEEPER multi-protocol
/// aggregator. Shares accrue phantom yield at a FIXED target APY set at
/// construction; sharePrice() therefore grows at that rate. All math is
/// honest on-chain math — nothing is faked in the reader.
contract SimpleVault {
    string public name;
    uint256 public targetApyBps; // e.g. 250 = 2.50%
    uint256 public lastAccrue;
    uint256 public totalShares;
    uint256 public phantomAssets; // accrued phantom yield (wei)
    mapping(address => uint256) public shares;

    event Deposit(address indexed user, uint256 assets, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 assets, uint256 sharesBurned);

    constructor(string memory _name, uint256 _targetApyBps) {
        name = _name;
        targetApyBps = _targetApyBps;
        lastAccrue = block.timestamp;
    }

    function _accrue() internal {
        uint256 dt = block.timestamp - lastAccrue;
        if (dt > 0 && totalShares > 0) {
            phantomAssets += (dt * totalShares * targetApyBps) / (365 days * 10000);
            lastAccrue = block.timestamp;
        }
    }

    /// @notice total claimable assets (real balance + phantom yield)
    function totalAssets() public view returns (uint256) {
        uint256 pending = 0;
        if (totalShares > 0) {
            pending = ((block.timestamp - lastAccrue) * totalShares * targetApyBps) / (365 days * 10000);
        }
        return address(this).balance + phantomAssets + pending;
    }

    function totalSupply() external view returns (uint256) {
        return totalShares;
    }

    function sharePrice() external view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (totalAssets() * 1e18) / totalShares;
    }

    function supplyApyBps() external view returns (uint256) {
        return targetApyBps;
    }

    function balanceOf(address u) external view returns (uint256) {
        return shares[u];
    }

    function deposit() external payable returns (uint256 minted) {
        require(msg.value > 0, "zero deposit");
        _accrue();
        uint256 prior = totalAssets() - msg.value; // exclude the new deposit
        if (totalShares == 0) {
            minted = msg.value;
        } else {
            minted = prior == 0 ? msg.value : (msg.value * totalShares) / prior;
        }
        shares[msg.sender] += minted;
        totalShares += minted;
        emit Deposit(msg.sender, msg.value, minted);
    }

    function withdraw(uint256 s) external {
        require(s > 0 && shares[msg.sender] >= s, "bad shares");
        _accrue();
        uint256 assets = (s * totalAssets()) / totalShares;
        shares[msg.sender] -= s;
        totalShares -= s;
        (bool ok, ) = msg.sender.call{value: assets}("");
        require(ok, "send failed");
        emit Withdraw(msg.sender, assets, s);
    }

    receive() external payable {}
}
