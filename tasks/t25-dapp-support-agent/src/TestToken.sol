// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice T25 diagnostic fixture: minimal ERC-20 used ONLY to generate REAL,
/// labeled on-chain insufficient-allowance / insufficient-token-balance
/// failures for the support agent to diagnose. Deployed on Pharos Atlantic
/// testnet only. Constructor mints 1000 SDT to the deployer.
contract TestToken {
    string public name = "SupportDiag Token";
    string public symbol = "SDT";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor() {
        totalSupply = 1000e18;
        balanceOf[msg.sender] = totalSupply;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
