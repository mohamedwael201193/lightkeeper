// SPDX-License-Identifier: MIT
// KeeperToken (LPK) — T14 test asset for the LIGHTKEEPER Portfolio Assistant.
// Purpose-built test token on Pharos Atlantic testnet ONLY. NO market value.
// Deployer receives the full initial supply in the constructor so the
// LIGHTKEEPER wallet holds a non-trivial ERC20 position for portfolio reads.
pragma solidity ^0.8.24;

contract KeeperToken {
    string public constant name = "Lightkeeper Test Token";
    string public constant symbol = "LPK";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        totalSupply = 1_000_000 * 10 ** 18; // 1,000,000 LPK, testnet-only
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _spend(msg.sender, value);
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "LPK: allowance exceeded");
        allowance[from][msg.sender] = allowed - value;
        _spend(from, value);
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    function _spend(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "LPK: balance exceeded");
        balanceOf[from] -= value;
    }
}
