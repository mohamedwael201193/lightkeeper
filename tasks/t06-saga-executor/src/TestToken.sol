// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TestToken — LIGHTKEEPER T06 saga fixture token (Atlantic testnet, dust only)
/// @notice Minimal ERC20. Entire supply minted to the deployer at construction.
/// @dev Hand-rolled on purpose: no dependencies, dust-scale test asset.
contract TestToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply_) {
        require(initialSupply_ > 0, "TestToken: zero supply");
        name = name_;
        symbol = symbol_;
        totalSupply = initialSupply_;
        balanceOf[msg.sender] = initialSupply_;
        emit Transfer(address(0), msg.sender, initialSupply_);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "TestToken: insufficient balance");
        unchecked {
            balanceOf[msg.sender] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "TestToken: insufficient allowance");
        require(balanceOf[from] >= value, "TestToken: insufficient balance");
        unchecked {
            if (allowed != type(uint256).max) {
                allowance[from][msg.sender] = allowed - value;
            }
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
        return true;
    }
}
