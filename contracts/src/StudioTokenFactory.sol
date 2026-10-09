// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StudioToken} from "./StudioToken.sol";
import {StudioFeeVault} from "./StudioFeeVault.sol";

/// @dev Implemented protocol market required; an arbitrary existing AMM is not compatible.
interface IStudioLaunchMarket {
    function initializeLaunch(bytes32 launchId, address token, uint256 nftId, address creator, address feeVault) external;
    /// Pull up to quoteIn from msg.sender, apply disclosed fees, and deliver tokens to recipient.
    function buy(address token, uint256 quoteIn, uint256 minTokenOut, address recipient, uint256 deadline) external returns (uint256 tokenOut);
}

/// @notice Atomic launch coordinator under development; NOT deployed or audited.
/// No creator allocation, vesting or creator-selected market exists.
/// Curve, graduation and actual market implementation remain separate deployment gates.
contract StudioTokenFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant TOKEN_SUPPLY = 1_000_000_000 ether;
    IERC721 public immutable collection;
    IERC20 public immutable quote;
    IStudioLaunchMarket public immutable market;
    StudioFeeVault public immutable feeVault;
    address public immutable graduatedRecorder;

    struct Launch { bytes32 launchId; uint256 nftId; address creator; address token; uint256 initialQuoteIn; uint256 initialTokenOut; }
    struct LaunchParams { uint256 nftId; string name; string symbol; uint256 initialQuoteIn; uint256 minTokenOut; uint256 deadline; }
    Launch[] public launches;
    error InvalidConfiguration();
    error OwnerRequired();
    error InvalidMetadata();
    error Expired();
    error InvalidInitialBuy();
    error UnsupportedQuote();
    error InvalidMarketResult();
    event TokenLaunched(bytes32 indexed launchId, uint256 indexed nftId, address indexed token, address creator, uint256 supply, uint256 initialQuoteIn, uint256 initialTokenOut);

    constructor(IERC721 collection_, IERC20 quote_, IStudioLaunchMarket market_, address graduatedRecorder_, address treasury_) {
        if (address(collection_).code.length == 0 || !collection_.supportsInterface(0x80ac58cd)
            || address(quote_).code.length == 0 || IERC20Metadata(address(quote_)).decimals() != 18
            || address(market_).code.length == 0 || graduatedRecorder_.code.length == 0) revert InvalidConfiguration();
        collection = collection_; quote = quote_; market = market_; graduatedRecorder = graduatedRecorder_;
        // Registrar identity is the factory itself, avoiding a mutable post-launch registration step.
        feeVault = new StudioFeeVault(collection_, quote_, address(this), treasury_);
    }

    function launch(LaunchParams calldata params) external nonReentrant returns (address tokenAddress) {
        if (block.timestamp > params.deadline) revert Expired();
        if (collection.ownerOf(params.nftId) != msg.sender) revert OwnerRequired();
        if (bytes(params.name).length == 0 || bytes(params.name).length > 64
            || bytes(params.symbol).length == 0 || bytes(params.symbol).length > 12) revert InvalidMetadata();
        if ((params.initialQuoteIn == 0 && params.minTokenOut != 0)
            || (params.initialQuoteIn != 0 && params.minTokenOut == 0)) revert InvalidInitialBuy();

        tokenAddress = address(new StudioToken(params.name, params.symbol, TOKEN_SUPPLY, address(this)));
        IERC20 token = IERC20(tokenAddress);
        bytes32 launchId = keccak256(abi.encode(block.chainid, address(this), launches.length, params.nftId, tokenAddress));
        feeVault.registerLaunch(launchId, tokenAddress, params.nftId, msg.sender, address(market), graduatedRecorder);
        token.safeTransfer(address(market), TOKEN_SUPPLY);
        market.initializeLaunch(launchId, tokenAddress, params.nftId, msg.sender, address(feeVault));
        // Initialization cannot grant creator tokens or dispose of the launch inventory.
        if (token.balanceOf(address(market)) != TOKEN_SUPPLY || token.balanceOf(msg.sender) != 0) revert InvalidMarketResult();

        uint256 tokenOut;
        uint256 quoteSpent;
        if (params.initialQuoteIn != 0) {
            uint256 quoteBefore = quote.balanceOf(address(this));
            quote.safeTransferFrom(msg.sender, address(this), params.initialQuoteIn);
            if (quote.balanceOf(address(this)) != quoteBefore + params.initialQuoteIn) revert UnsupportedQuote();
            quote.forceApprove(address(market), params.initialQuoteIn);
            tokenOut = market.buy(tokenAddress, params.initialQuoteIn, params.minTokenOut, msg.sender, params.deadline);
            quote.forceApprove(address(market), 0);
            uint256 quoteAfter = quote.balanceOf(address(this));
            if (quoteAfter < quoteBefore || quoteAfter >= quoteBefore + params.initialQuoteIn) revert UnsupportedQuote();
            uint256 refund = quoteAfter - quoteBefore;
            quoteSpent = params.initialQuoteIn - refund;
            if (refund != 0) {
                uint256 recipientBefore = quote.balanceOf(msg.sender);
                quote.safeTransfer(msg.sender, refund);
                if (quote.balanceOf(msg.sender) != recipientBefore + refund) revert UnsupportedQuote();
            }
            if (quote.balanceOf(address(this)) != quoteBefore) revert UnsupportedQuote();
            if (tokenOut < params.minTokenOut || tokenOut > TOKEN_SUPPLY
                || token.balanceOf(msg.sender) != tokenOut) revert InvalidMarketResult();
        }
        // External initialization/payment cannot silently transfer the NFT during launch.
        if (collection.ownerOf(params.nftId) != msg.sender) revert OwnerRequired();
        launches.push(Launch(launchId, params.nftId, msg.sender, tokenAddress, quoteSpent, tokenOut));
        emit TokenLaunched(launchId, params.nftId, tokenAddress, msg.sender, TOKEN_SUPPLY, quoteSpent, tokenOut);
    }
    function launchCount() external view returns (uint256) { return launches.length; }
}
