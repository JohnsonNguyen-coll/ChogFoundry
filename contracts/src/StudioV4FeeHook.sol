// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StudioFeeVault} from "./StudioFeeVault.sol";
import {StudioTokenFactory} from "./StudioTokenFactory.sol";
import {StudioV4LiquidityLock, IV4PoolManager} from "./StudioV4LiquidityLock.sol";

/// @notice Pool-bound funded quote fees for all four swap modes. Undeployed, unaudited.
/// Rates are explicit deployment inputs, not approved post-graduation product defaults.
contract StudioV4FeeHook {
    using SafeERC20 for IERC20;
    uint160 public constant REQUIRED_FLAGS = 0x20cc;
    IV4PoolManager public immutable poolManager;
    IERC20 public immutable quote;
    address public immutable liquidityLock;
    address public immutable factory;
    uint256 public immutable creatorBps;
    uint256 public immutable studioBps;
    uint256 public immutable platformBps;
    uint256 public immutable totalBps;
    struct BoundPool { bytes32 launchId; StudioFeeVault vault; }
    mapping(bytes32 => BoundPool) public pools;
    error Unauthorized();
    error InvalidConfiguration();
    error UnboundPool();
    error InvalidAmount();
    error UnsupportedQuote();
    event PoolBound(bytes32 indexed poolId, bytes32 indexed launchId, address indexed token);
    event HookFee(bytes32 indexed poolId, uint256 quoteBase, uint256 creatorFee, uint256 studioFee, uint256 platformFee);

    constructor(IV4PoolManager manager_, IERC20 quote_, address lock_, address factory_, uint256 creator_, uint256 studio_, uint256 platform_) {
        uint256 total = creator_ + studio_ + platform_;
        if ((uint160(address(this)) & 0x3fff) != REQUIRED_FLAGS || address(manager_).code.length == 0
            || address(quote_).code.length == 0 || lock_ == address(0) || factory_ == address(0)
            || total == 0 || total >= 10000) revert InvalidConfiguration();
        poolManager = manager_; quote = quote_; liquidityLock = lock_; factory = factory_;
        creatorBps = creator_; studioBps = studio_; platformBps = platform_; totalBps = total;
    }
    modifier onlyManager() { if (msg.sender != address(poolManager)) revert Unauthorized(); _; }
    function beforeInitialize(address sender, IV4PoolManager.PoolKey calldata key, uint160) external onlyManager returns (bytes4) {
        if (sender != liquidityLock || key.hooks != address(this)) revert Unauthorized();
        address token = key.currency0 == address(quote) ? key.currency1 : key.currency0;
        if (key.currency0 != address(quote) && key.currency1 != address(quote)) revert InvalidConfiguration();
        StudioV4LiquidityLock lock = StudioV4LiquidityLock(liquidityLock);
        StudioTokenFactory coordinator = StudioTokenFactory(factory);
        if (keccak256(abi.encode(key)) != keccak256(abi.encode(lock.poolKey(token)))
            || address(lock.poolManager()) != address(poolManager) || address(lock.quote()) != address(quote)
            || address(coordinator.market()) != lock.market() || coordinator.graduatedRecorder() != address(this)) revert InvalidConfiguration();
        StudioFeeVault vault = coordinator.feeVault();
        bytes32 launchId = vault.launchForToken(token);
        (address registeredToken,,, , address recorder) = vault.launches(launchId);
        if (launchId == bytes32(0) || registeredToken != token || recorder != address(this)) revert InvalidConfiguration();
        bytes32 poolId = keccak256(abi.encode(key));
        if (pools[poolId].launchId != bytes32(0)) revert InvalidConfiguration();
        pools[poolId] = BoundPool(launchId, vault);
        emit PoolBound(poolId, launchId, token);
        return this.beforeInitialize.selector;
    }
    function _quoteSpecified(IV4PoolManager.PoolKey calldata key, IV4PoolManager.SwapParams calldata params) private view returns (bool) {
        bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        return specifiedIs0 == (key.currency0 == address(quote));
    }
    function beforeSwap(address, IV4PoolManager.PoolKey calldata key, IV4PoolManager.SwapParams calldata params, bytes calldata) external onlyManager returns (bytes4, int256, uint24) {
        bytes32 poolId = _bound(key);
        if (params.amountSpecified == 0 || params.amountSpecified == type(int256).min) revert InvalidAmount();
        if (!_quoteSpecified(key, params)) return (this.beforeSwap.selector, 0, 0);
        uint256 specified = uint256(params.amountSpecified < 0 ? -params.amountSpecified : params.amountSpecified);
        uint256 base; uint256 fee;
        if (params.amountSpecified < 0) {
            // Gross quote budget: positive specified delta reduces the amount entering the pool.
            fee = Math.mulDiv(specified, totalBps, 10000 + totalBps, Math.Rounding.Ceil);
            base = specified - fee;
        } else {
            // Exact net quote output: the pool must output enough to cover net output + fee.
            base = Math.mulDiv(specified, 10000, 10000 - totalBps, Math.Rounding.Ceil);
            fee = base - specified;
        }
        if (base == 0 || fee > uint256(uint128(type(int128).max))) revert InvalidAmount();
        _credit(poolId, base, fee);
        return (this.beforeSwap.selector, int256(fee << 128), 0);
    }
    function afterSwap(address, IV4PoolManager.PoolKey calldata key, IV4PoolManager.SwapParams calldata params, int256 packed, bytes calldata) external onlyManager returns (bytes4, int128) {
        bytes32 poolId = _bound(key);
        if (_quoteSpecified(key, params)) {
            uint256 specified = uint256(params.amountSpecified < 0 ? -params.amountSpecified : params.amountSpecified);
            uint256 expected;
            if (params.amountSpecified < 0) expected = specified - Math.mulDiv(specified, totalBps, 10000 + totalBps, Math.Rounding.Ceil);
            else expected = Math.mulDiv(specified, 10000, 10000 - totalBps, Math.Rounding.Ceil);
            int128 actual = key.currency0 == address(quote) ? int128(packed >> 128) : int128(packed);
            uint256 actualBase = uint256(actual < 0 ? -int256(actual) : int256(actual));
            // Reject partial quote-specified fills rather than overcharge the prepaid fee.
            if (actualBase != expected) revert InvalidAmount();
            return (this.afterSwap.selector, 0);
        }
        int128 quoteDelta = key.currency0 == address(quote) ? int128(packed >> 128) : int128(packed);
        uint256 base = uint256(quoteDelta < 0 ? -int256(quoteDelta) : int256(quoteDelta));
        uint256 fee = Math.mulDiv(base, totalBps, 10000, Math.Rounding.Ceil);
        if (base == 0 || fee > uint256(uint128(type(int128).max))) revert InvalidAmount();
        _credit(poolId, base, fee);
        return (this.afterSwap.selector, int128(int256(fee)));
    }
    function _bound(IV4PoolManager.PoolKey calldata key) private view returns (bytes32 poolId) {
        if (key.hooks != address(this)) revert UnboundPool();
        poolId = keccak256(abi.encode(key));
        if (pools[poolId].launchId == bytes32(0)) revert UnboundPool();
    }
    function _credit(bytes32 poolId, uint256 base, uint256 fee) private {
        BoundPool storage pool = pools[poolId];
        uint256 creator = Math.mulDiv(base, creatorBps, 10000);
        uint256 studio = Math.mulDiv(base, studioBps, 10000);
        if (fee < creator + studio) revert InvalidAmount();
        uint256 beforeBalance = quote.balanceOf(address(this));
        poolManager.take(address(quote), address(this), fee);
        if (quote.balanceOf(address(this)) != beforeBalance + fee) revert UnsupportedQuote();
        quote.forceApprove(address(pool.vault), fee);
        pool.vault.recordFees(pool.launchId, creator, studio, fee - creator - studio);
        quote.forceApprove(address(pool.vault), 0);
        if (quote.balanceOf(address(this)) != beforeBalance) revert UnsupportedQuote();
        emit HookFee(poolId, base, creator, studio, fee - creator - studio);
    }
}

/// @notice Deterministic deployment utility; mining the hook permission bits does not alter code.
contract StudioHookDeployer {
    address public immutable deployer = msg.sender;
    error Unauthorized();

    function deploy(bytes32 salt, bytes calldata creationCode) external returns (address deployed) {
        if (msg.sender != deployer) revert Unauthorized();
        bytes memory code = creationCode;
        assembly ("memory-safe") { deployed := create2(0, add(code, 32), mload(code), salt) }
        require(deployed != address(0), "deployment failed");
    }
}
