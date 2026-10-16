// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Lite {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal constant-product AMM venue for LIGHTKEEPER T07
///         (Arbitrage Scanner) on Pharos Atlantic testnet.
///         One pool = one independent venue. Three pools are deployed with
///         deliberately different reserve ratios so real, on-chain,
///         computable spreads exist for the scanner to find.
///         0.30% fee per swap leg, charged on the NOTIONAL (input amount).
contract ArbPool {
    address public immutable token0; // WPHRS (test wrapped native)
    address public immutable token1; // TKB   (test USD stablecoin)
    uint112 public reserve0;
    uint112 public reserve1;
    uint256 public constant FEE_BPS = 30; // 0.30% per swap leg
    address public immutable owner;

    event Swap(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );
    event Seeded(uint112 reserve0, uint112 reserve1);

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
        owner = msg.sender;
    }

    /// @notice Pull initial liquidity from the owner (deployer) and set reserves.
    ///         Testnet venue setup only.
    function seed(uint112 r0, uint112 r1) external {
        require(msg.sender == owner, "ArbPool: not owner");
        require(IERC20Lite(token0).transferFrom(msg.sender, address(this), r0), "ArbPool: t0 in");
        require(IERC20Lite(token1).transferFrom(msg.sender, address(this), r1), "ArbPool: t1 in");
        reserve0 = r0;
        reserve1 = r1;
        emit Seeded(r0, r1);
    }

    function getReserves() external view returns (uint112 r0, uint112 r1) {
        return (reserve0, reserve1);
    }

    /// @notice Constant-product quote with fee on the notional.
    /// @dev amountOut = (amountIn*(10000-FEE_BPS)*rOut) / (rIn*10000 + amountIn*(10000-FEE_BPS))
    function getAmountOut(uint256 amountIn, address tokenIn)
        public
        view
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "ArbPool: zero input");
        require(amountIn <= type(uint112).max, "ArbPool: input too large");
        require(tokenIn == token0 || tokenIn == token1, "ArbPool: unknown token");
        (uint256 rIn, uint256 rOut) =
            tokenIn == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        require(rIn > 0 && rOut > 0, "ArbPool: no liquidity");
        uint256 amountInWithFee = amountIn * (10000 - FEE_BPS);
        uint256 numerator = amountInWithFee * rOut;
        uint256 denominator = rIn * 10000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Execute a single-leg swap, updating reserves.
    function swap(uint256 amountIn, address tokenIn, address to)
        external
        returns (uint256 amountOut)
    {
        amountOut = getAmountOut(amountIn, tokenIn);
        require(amountOut > 0, "ArbPool: zero output");
        require(IERC20Lite(tokenIn).transferFrom(msg.sender, address(this), amountIn), "ArbPool: in");
        address tokenOut = tokenIn == token0 ? token1 : token0;
        require(IERC20Lite(tokenOut).transfer(to, amountOut), "ArbPool: out");
        if (tokenIn == token0) {
            reserve0 = uint112(reserve0 + amountIn);
            reserve1 = uint112(reserve1 - amountOut);
        } else {
            reserve1 = uint112(reserve1 + amountIn);
            reserve0 = uint112(reserve0 - amountOut);
        }
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, to);
    }
}
