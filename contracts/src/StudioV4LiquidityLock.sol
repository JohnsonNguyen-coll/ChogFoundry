// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

// ABI-compatible subset of Uniswap v4-core v4.0.0 IPoolManager; native currency excluded.
interface IV4PoolManager {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct ModifyLiquidityParams { int24 tickLower; int24 tickUpper; int256 liquidityDelta; bytes32 salt; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
    function initialize(PoolKey calldata key, uint160 sqrtPriceX96) external returns (int24 tick);
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData) external returns (int256 callerDelta, int256 feesAccrued);
    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData) external returns (int256 delta);
    function sync(address currency) external;
    function settle() external payable returns (uint256 paid);
    function take(address currency, address to, uint256 amount) external;
}

/// @notice Direct v4 full-range custody. No liquidity removal, upgrade or rescue entry point.
/// @dev Undeployed integration source: optional immutable pool hook supplies protocol fees.
/// LP fees remain in the position; no claim-time NFT fee attribution is performed.
contract StudioV4LiquidityLock is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint160 private constant MIN_SQRT = 4295128739;
    uint160 private constant MAX_SQRT = 1461446703485210103287273052203988822378723970342;
    uint256 private constant Q96 = 1 << 96;
    address public immutable market;
    IERC20 public immutable quote;
    IV4PoolManager public immutable poolManager;
    uint24 public immutable lpFee;
    address public immutable hook;
    struct Position { bytes32 poolId; uint160 sqrtPriceX96; uint128 liquidity; uint256 tokenSeeded; uint256 quoteSeeded; uint256 tokenDust; uint256 quoteDust; }
    mapping(address => Position) public positions;
    bytes32 private pending;
    error Unauthorized();
    error InvalidConfiguration();
    error InvalidAmount();
    error UnsupportedTransfer();
    error InvalidSettlement();
    error Slippage();
    error Expired();
    event LiquidityLocked(address indexed token, bytes32 indexed poolId, uint128 liquidity, uint256 tokenSeeded, uint256 quoteSeeded, uint256 tokenDust, uint256 quoteDust);
    event PoolTrade(address indexed token, address indexed payer, address indexed recipient, bool quoteIn, uint256 amountIn, uint256 amountOut);

    constructor(address market_, IERC20 quote_, IV4PoolManager poolManager_, uint24 lpFee_, address hook_) {
        if (market_ == address(0) || address(quote_).code.length == 0 || address(poolManager_).code.length == 0 || lpFee_ >= 1000000) revert InvalidConfiguration();
        market = market_; quote = quote_; poolManager = poolManager_; lpFee = lpFee_; hook = hook_;
    }
    function poolKey(address token) public view returns (IV4PoolManager.PoolKey memory) {
        if (token == address(quote) || token == address(0)) revert InvalidConfiguration();
        (address c0, address c1) = token < address(quote) ? (token, address(quote)) : (address(quote), token);
        return IV4PoolManager.PoolKey(c0, c1, lpFee, 1, hook);
    }
    function seed(address token, uint256 tokenAmount, uint256 quoteAmount) external nonReentrant returns (bytes32 poolId) {
        if (msg.sender != market) revert Unauthorized();
        if (positions[token].poolId != bytes32(0) || tokenAmount == 0 || quoteAmount == 0) revert InvalidAmount();
        _pull(IERC20(token), msg.sender, tokenAmount); _pull(quote, msg.sender, quoteAmount);
        IV4PoolManager.PoolKey memory key = poolKey(token);
        (uint256 amount0, uint256 amount1) = key.currency0 == token ? (tokenAmount, quoteAmount) : (quoteAmount, tokenAmount);
        // Q128 ratio -> integer sqrt -> Q96. Extreme ratios reject instead of truncating.
        uint256 sqrt = Math.sqrt(Math.mulDiv(amount1, 1 << 128, amount0)) << 32;
        if (sqrt <= MIN_SQRT || sqrt >= MAX_SQRT) revert InvalidAmount();
        uint160 sqrtPrice = uint160(sqrt);
        uint256 l0 = Math.mulDiv(amount0, Math.mulDiv(sqrtPrice, MAX_SQRT, Q96), MAX_SQRT - sqrtPrice);
        uint256 l1 = Math.mulDiv(amount1, Q96, sqrtPrice - MIN_SQRT);
        uint256 liquidity = Math.min(l0, l1);
        // Round conservatively so manager's rounded-up principal debts stay within budgets.
        if (liquidity <= 1 || liquidity > uint256(uint128(type(int128).max))) revert InvalidAmount();
        liquidity -= 1;
        poolManager.initialize(key, sqrtPrice);
        bytes memory data = abi.encode(uint8(0), key, int256(liquidity), amount0, amount1, address(this), uint160(0));
        pending = keccak256(data);
        bytes memory result = poolManager.unlock(data); pending = bytes32(0);
        (uint256 used0, uint256 used1) = abi.decode(result, (uint256, uint256));
        if (used0 == 0 || used1 == 0 || used0 > amount0 || used1 > amount1
            || used0 < amount0 - amount0 / 1000000 || used1 < amount1 - amount1 / 1000000) revert InvalidSettlement();
        (uint256 usedToken, uint256 usedQuote) = key.currency0 == token ? (used0, used1) : (used1, used0);
        poolId = keccak256(abi.encode(key));
        positions[token] = Position(poolId, sqrtPrice, uint128(liquidity), usedToken, usedQuote, tokenAmount - usedToken, quoteAmount - usedQuote);
        emit LiquidityLocked(token, poolId, uint128(liquidity), usedToken, usedQuote, tokenAmount - usedToken, quoteAmount - usedQuote);
    }
    /// @notice Swaps through the configured pool, including hook deltas when a hook is configured.
    function swap(address token, bool quoteIn, uint256 maxInput, uint256 minOutput, address recipient, uint256 deadline) external nonReentrant returns (uint256 amountOut) {
        return _swap(token, quoteIn, maxInput, minOutput, recipient, deadline, -int256(maxInput), 0);
    }
    function swapExactOutput(address token, bool quoteIn, uint256 output, uint256 maxInput, address recipient, uint256 deadline) external nonReentrant returns (uint256) {
        if (output == 0 || output > uint256(type(int256).max)) revert InvalidAmount();
        return _swap(token, quoteIn, maxInput, output, recipient, deadline, int256(output), 0);
    }
    /// @notice Price limit is currency1/currency0 sqrt price in Q96, as in PoolManager.
    /// Zero uses the protocol bounds. Partial exact-input fills refund unspent input;
    /// the hook rejects quote-specified partial fills to preserve fee accounting.
    function swapWithPriceLimit(address token, bool quoteIn, uint256 maxInput, uint256 minOutput, address recipient, uint256 deadline, uint160 sqrtPriceLimitX96) external nonReentrant returns (uint256) {
        return _swap(token, quoteIn, maxInput, minOutput, recipient, deadline, -int256(maxInput), sqrtPriceLimitX96);
    }
    function swapExactOutputWithPriceLimit(address token, bool quoteIn, uint256 output, uint256 maxInput, address recipient, uint256 deadline, uint160 sqrtPriceLimitX96) external nonReentrant returns (uint256) {
        if (output == 0 || output > uint256(type(int256).max)) revert InvalidAmount();
        return _swap(token, quoteIn, maxInput, output, recipient, deadline, int256(output), sqrtPriceLimitX96);
    }
    function _swap(address token, bool quoteIn, uint256 maxInput, uint256 minOutput, address recipient, uint256 deadline, int256 specified, uint160 priceLimit) private returns (uint256) {
        if (block.timestamp > deadline) revert Expired();
        if (maxInput == 0 || maxInput > uint256(type(int256).max)
            || minOutput == 0 || recipient == address(0) || recipient == address(this)) revert InvalidAmount();
        IV4PoolManager.PoolKey memory key = poolKey(token);
        address input = quoteIn ? address(quote) : token;
        bool zeroForOne = key.currency0 == input;
        if (priceLimit == 0) priceLimit = zeroForOne ? MIN_SQRT + 1 : MAX_SQRT - 1;
        if (priceLimit <= MIN_SQRT || priceLimit >= MAX_SQRT) revert InvalidAmount();
        // PoolManager validates the limit against the current price and swap direction.
        _pull(IERC20(input), msg.sender, maxInput);
        bytes memory data = abi.encode(uint8(zeroForOne ? 1 : 2), key, specified, zeroForOne ? maxInput : 0, zeroForOne ? 0 : maxInput, recipient, priceLimit);
        pending = keccak256(data);
        bytes memory result = poolManager.unlock(data); pending = bytes32(0);
        (uint256 spent, uint256 output) = abi.decode(result, (uint256, uint256));
        if (spent == 0 || spent > maxInput || output < minOutput) revert Slippage();
        if (spent < maxInput) _pay(IERC20(input), msg.sender, maxInput - spent);
        emit PoolTrade(token, msg.sender, recipient, quoteIn, spent, output);
        return output;
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || pending == bytes32(0) || pending != keccak256(data)) revert Unauthorized();
        (uint8 operation, IV4PoolManager.PoolKey memory key, int256 amount, uint256 max0, uint256 max1, address recipient, uint160 priceLimit) = abi.decode(data, (uint8, IV4PoolManager.PoolKey, int256, uint256, uint256, address, uint160));
        int256 packed;
        if (operation == 0) {
            if (amount <= 0) revert InvalidAmount();
            (packed,) = poolManager.modifyLiquidity(key, IV4PoolManager.ModifyLiquidityParams(-887272, 887272, amount, bytes32(0)), '');
        } else {
            packed = poolManager.swap(key, IV4PoolManager.SwapParams(operation == 1, amount, priceLimit), '');
        }
        int128 delta0 = int128(packed >> 128); int128 delta1 = int128(packed);
        if (operation == 0) {
            if (delta0 >= 0 || delta1 >= 0) revert InvalidSettlement();
            uint256 used0 = uint256(-int256(delta0)); uint256 used1 = uint256(-int256(delta1));
            _settle(key.currency0, used0, max0); _settle(key.currency1, used1, max1);
            return abi.encode(used0, used1);
        }
        int128 inputDelta = operation == 1 ? delta0 : delta1;
        int128 outputDelta = operation == 1 ? delta1 : delta0;
        if (inputDelta >= 0 || outputDelta <= 0) revert InvalidSettlement();
        uint256 spent = uint256(-int256(inputDelta)); uint256 output = uint256(int256(outputDelta));
        _settle(operation == 1 ? key.currency0 : key.currency1, spent, operation == 1 ? max0 : max1);
        address outputCurrency = operation == 1 ? key.currency1 : key.currency0;
        uint256 beforeRecipient = IERC20(outputCurrency).balanceOf(recipient);
        poolManager.take(outputCurrency, recipient, output);
        if (IERC20(outputCurrency).balanceOf(recipient) != beforeRecipient + output) revert UnsupportedTransfer();
        return abi.encode(spent, output);
    }
    function _settle(address currency, uint256 amount, uint256 maximum) private {
        if (amount > maximum) revert InvalidSettlement();
        poolManager.sync(currency);
        uint256 beforeBalance = IERC20(currency).balanceOf(address(poolManager));
        _pay(IERC20(currency), address(poolManager), amount);
        if (IERC20(currency).balanceOf(address(poolManager)) != beforeBalance + amount || poolManager.settle() != amount) revert InvalidSettlement();
    }
    function _pull(IERC20 asset, address from, uint256 amount) private {
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(from, address(this), amount);
        if (asset.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTransfer();
    }
    function _pay(IERC20 asset, address to, uint256 amount) private {
        uint256 beforeBalance = asset.balanceOf(address(this)); uint256 recipientBefore = asset.balanceOf(to);
        asset.safeTransfer(to, amount);
        if (asset.balanceOf(address(this)) != beforeBalance - amount || asset.balanceOf(to) != recipientBefore + amount) revert UnsupportedTransfer();
    }
}
