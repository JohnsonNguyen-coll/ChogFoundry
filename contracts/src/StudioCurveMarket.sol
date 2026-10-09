// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StudioTokenFactory, IStudioLaunchMarket} from "./StudioTokenFactory.sol";
import {StudioFeeVault} from "./StudioFeeVault.sol";

interface IStudioGraduation {
    function market() external view returns (address);
    function quote() external view returns (address);
    function seed(address token, uint256 tokenAmount, uint256 quoteAmount) external returns (bytes32 poolId);
}

/// @notice Parameterized linear market, undeployed. Post-graduation hook fees remain incomplete.
/// All economic parameters are explicit constructor inputs, NOT product defaults.
contract StudioCurveMarket is IStudioLaunchMarket, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant TOKEN_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CREATOR_BPS = 30;
    uint256 public constant STUDIO_BPS = 30;
    uint256 public constant PLATFORM_BPS = 40;
    address public immutable factory;
    IERC721 public immutable collection;
    IERC20 public immutable quote;
    uint256 public immutable saleSupply;
    uint256 public immutable openingPrice;
    uint256 public immutable priceIncrease;
    uint256 public immutable targetReserve;
    uint256 public totalReserve;
    IStudioGraduation public immutable graduationAdapter;
    struct Curve { bytes32 launchId; StudioFeeVault vault; uint256 sold; uint256 reserve; bool graduated; }
    struct BuyQuote { uint256 tokenOut; uint256 baseQuote; uint256 creatorFee; uint256 studioFee; uint256 platformFee; uint256 quoteSpent; }
    mapping(address => Curve) public curves;
    error InvalidConfiguration();
    error Unauthorized();
    error UnknownToken();
    error InvalidTrade();
    error Slippage();
    error Expired();
    error UnsupportedTransfer();
    error Insolvent();
    event Graduated(address indexed token, bytes32 indexed poolId, address liquidityLock, uint256 tokenAmount, uint256 quoteAmount);
    event MarketInitialized(address indexed token, bytes32 indexed launchId, uint256 indexed nftId, address creator);
    event Traded(address indexed token, address indexed payer, address indexed recipient, bool buySide, uint256 tokenAmount, uint256 baseQuote, uint256 totalFee, uint256 sold, uint256 reserve);

    constructor(address factory_, IERC721 collection_, IERC20 quote_, uint256 saleSupply_, uint256 openingPrice_, uint256 priceIncrease_, IStudioGraduation graduationAdapter_) {
        if (factory_ == address(0) || address(collection_).code.length == 0 || address(quote_).code.length == 0
            || saleSupply_ == 0 || saleSupply_ >= TOKEN_SUPPLY || openingPrice_ == 0 || priceIncrease_ == 0
            || openingPrice_ > type(uint128).max || priceIncrease_ > type(uint128).max) revert InvalidConfiguration();
        if (address(graduationAdapter_) != address(0)
            && (address(graduationAdapter_).code.length == 0 || graduationAdapter_.market() != address(this)
                || graduationAdapter_.quote() != address(quote_))) revert InvalidConfiguration();
        graduationAdapter = graduationAdapter_;
        factory = factory_; collection = collection_; quote = quote_;
        saleSupply = saleSupply_; openingPrice = openingPrice_; priceIncrease = priceIncrease_;
        targetReserve = _potential(saleSupply_, saleSupply_, openingPrice_, priceIncrease_);
        if (targetReserve == 0) revert InvalidConfiguration();
    }
    function initializeLaunch(bytes32 launchId, address token, uint256 nftId, address creator, address feeVault_) external nonReentrant {
        if (msg.sender != factory) revert Unauthorized();
        if (curves[token].launchId != bytes32(0)) revert InvalidConfiguration();
        StudioTokenFactory coordinator = StudioTokenFactory(factory);
        StudioFeeVault vault = StudioFeeVault(feeVault_);
        if (address(coordinator.market()) != address(this) || address(coordinator.quote()) != address(quote)
            || address(coordinator.collection()) != address(collection) || address(coordinator.feeVault()) != feeVault_
            || vault.registrar() != factory || address(vault.quote()) != address(quote) || address(vault.collection()) != address(collection)
            || collection.ownerOf(nftId) != creator || vault.launchForToken(token) != launchId
            || IERC20(token).totalSupply() != TOKEN_SUPPLY || IERC20(token).balanceOf(address(this)) != TOKEN_SUPPLY) revert InvalidConfiguration();
        (address registeredToken, uint256 registeredNft, address registeredCreator, address recorder,) = vault.launches(launchId);
        if (registeredToken != token || registeredNft != nftId || registeredCreator != creator || recorder != address(this)) revert InvalidConfiguration();
        curves[token] = Curve(launchId, vault, 0, 0, false);
        emit MarketInitialized(token, launchId, nftId, creator);
    }
    // Two full-precision mulDiv terms, each rounded down. Buy/sell use differences of this SAME potential.
    function _potential(uint256 x, uint256 supply, uint256 p0, uint256 dp) private pure returns (uint256) {
        return Math.mulDiv(p0, x, 1 ether) + Math.mulDiv(dp, x * x, 2 * supply * 1 ether);
    }
    function reserveAt(uint256 sold) public view returns (uint256) {
        if (sold > saleSupply) revert InvalidTrade();
        return _potential(sold, saleSupply, openingPrice, priceIncrease);
    }
    function _fees(uint256 base) private pure returns (uint256 creator, uint256 studio, uint256 platform) {
        uint256 total = Math.mulDiv(base, CREATOR_BPS + STUDIO_BPS + PLATFORM_BPS, 10000, Math.Rounding.Ceil);
        creator = Math.mulDiv(base, CREATOR_BPS, 10000);
        studio = Math.mulDiv(base, STUDIO_BPS, 10000);
        platform = total - creator - studio; // Disclosed integer remainder, not an extra percentage fee.
    }
    function _cost(uint256 current, uint256 next) private view returns (BuyQuote memory result) {
        result.tokenOut = next - current;
        result.baseQuote = reserveAt(next) - reserveAt(current);
        (result.creatorFee, result.studioFee, result.platformFee) = _fees(result.baseQuote);
        result.quoteSpent = result.baseQuote + result.creatorFee + result.studioFee + result.platformFee;
    }
    function getBuyQuote(address token, uint256 maxQuoteIn) public view returns (BuyQuote memory result) {
        Curve storage curve = curves[token];
        if (curve.launchId == bytes32(0)) revert UnknownToken();
        if (curve.graduated) revert InvalidTrade();
        uint256 low = curve.sold; uint256 high = saleSupply;
        while (low < high) {
            uint256 mid = low + (high - low + 1) / 2;
            if (_cost(curve.sold, mid).quoteSpent <= maxQuoteIn) low = mid;
            else high = mid - 1;
        }
        result = _cost(curve.sold, low);
        if (result.tokenOut == 0 || result.baseQuote == 0 || result.quoteSpent > maxQuoteIn) revert InvalidTrade();
    }
    function getSellQuote(address token, uint256 tokenIn) public view returns (uint256 baseQuote, uint256 creatorFee, uint256 studioFee, uint256 platformFee, uint256 quoteOut) {
        Curve storage curve = curves[token];
        if (curve.launchId == bytes32(0)) revert UnknownToken();
        if (curve.graduated) revert InvalidTrade();
        if (tokenIn == 0 || tokenIn > curve.sold) revert InvalidTrade();
        baseQuote = reserveAt(curve.sold) - reserveAt(curve.sold - tokenIn);
        (creatorFee, studioFee, platformFee) = _fees(baseQuote);
        uint256 fee = creatorFee + studioFee + platformFee;
        if (baseQuote <= fee) revert InvalidTrade();
        quoteOut = baseQuote - fee;
    }
    function buy(address token, uint256 maxQuoteIn, uint256 minTokenOut, address recipient, uint256 deadline) external nonReentrant returns (uint256 tokenOut) {
        _check(recipient, deadline);
        if (minTokenOut == 0) revert InvalidTrade();
        BuyQuote memory result = getBuyQuote(token, maxQuoteIn);
        if (result.tokenOut < minTokenOut) revert Slippage();
        _pull(quote, msg.sender, result.quoteSpent);
        Curve storage curve = curves[token];
        curve.sold += result.tokenOut; curve.reserve += result.baseQuote; totalReserve += result.baseQuote;
        _credit(curve, result.creatorFee, result.studioFee, result.platformFee);
        _pay(IERC20(token), recipient, result.tokenOut);
        _solvent();
        emit Traded(token, msg.sender, recipient, true, result.tokenOut, result.baseQuote, result.quoteSpent - result.baseQuote, curve.sold, curve.reserve);
        return result.tokenOut;
    }
    function sell(address token, uint256 tokenIn, uint256 minQuoteOut, address recipient, uint256 deadline) external nonReentrant returns (uint256 quoteOut) {
        _check(recipient, deadline);
        if (minQuoteOut == 0) revert InvalidTrade();
        (uint256 base, uint256 creator, uint256 studio, uint256 platform, uint256 output) = getSellQuote(token, tokenIn);
        if (output < minQuoteOut) revert Slippage();
        _solvent(); _pull(IERC20(token), msg.sender, tokenIn);
        Curve storage curve = curves[token];
        curve.sold -= tokenIn; curve.reserve -= base; totalReserve -= base;
        _credit(curve, creator, studio, platform); _pay(quote, recipient, output); _solvent();
        emit Traded(token, msg.sender, recipient, false, tokenIn, base, creator + studio + platform, curve.sold, curve.reserve);
        return output;
    }
    function _check(address recipient, uint256 deadline) private view {
        if (block.timestamp > deadline) revert Expired();
        if (recipient == address(0) || recipient == address(this)) revert InvalidTrade();
    }
    function _credit(Curve storage curve, uint256 creator, uint256 studio, uint256 platform) private {
        quote.forceApprove(address(curve.vault), creator + studio + platform);
        curve.vault.recordFees(curve.launchId, creator, studio, platform);
        quote.forceApprove(address(curve.vault), 0);
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
    function _solvent() private view { if (quote.balanceOf(address(this)) < totalReserve) revert Insolvent(); }
    /// Permissionless atomic migration: failed seeding rolls back flags/reserves and preserves redemption.
    function graduate(address token) external nonReentrant returns (bytes32 poolId) {
        Curve storage curve = curves[token];
        if (curve.launchId == bytes32(0) || curve.graduated || curve.sold != saleSupply
            || address(graduationAdapter) == address(0)) revert InvalidTrade();
        uint256 liquidityTokens = TOKEN_SUPPLY - saleSupply;
        uint256 reserve = curve.reserve;
        uint256 atTerminalPrice = Math.mulDiv(openingPrice + priceIncrease, liquidityTokens, 1 ether);
        if (reserve != targetReserve || (reserve > atTerminalPrice ? reserve - atTerminalPrice : atTerminalPrice - reserve) > 2) revert InvalidConfiguration();
        _solvent();
        uint256 quoteBefore = quote.balanceOf(address(this));
        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        curve.graduated = true; curve.reserve = 0; totalReserve -= reserve;
        quote.forceApprove(address(graduationAdapter), reserve);
        IERC20(token).forceApprove(address(graduationAdapter), liquidityTokens);
        poolId = graduationAdapter.seed(token, liquidityTokens, reserve);
        quote.forceApprove(address(graduationAdapter), 0);
        IERC20(token).forceApprove(address(graduationAdapter), 0);
        if (poolId == bytes32(0) || quote.balanceOf(address(this)) != quoteBefore - reserve
            || IERC20(token).balanceOf(address(this)) != tokenBefore - liquidityTokens) revert UnsupportedTransfer();
        _solvent();
        emit Graduated(token, poolId, address(graduationAdapter), liquidityTokens, reserve);
    }
    /// Readiness alone does not create a pool; sells stay enabled until successful migration.
    function graduationReady(address token) external view returns (bool) {
        return curves[token].launchId != bytes32(0) && !curves[token].graduated && curves[token].sold == saleSupply;
    }
}
