// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// INFERENCE: the doc says `forge test` but ships no test file. This minimal
// test exercises the doc's constructor exactly as documented.
import "forge-std/Test.sol";
import "../src/Token.sol";

contract TokenTest is Test {
    function testInitialSupplyMintedToDeployer() public {
        Token token = new Token(1000000);
        assertEq(token.totalSupply(), 1000000);
        assertEq(token.balanceOf(address(this)), 1000000);
        assertEq(token.name(), "Token");
        assertEq(token.symbol(), "MTK");
    }
}
