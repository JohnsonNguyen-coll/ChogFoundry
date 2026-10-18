// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Funded fee accounting under development; NOT deployed or audited.
/// @dev Market/hook computes disclosed fee amounts. This vault sets no economic rates.
/// Registrar and both per-launch recorders are trusted protocol integration boundaries.
contract StudioFeeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC721 public immutable collection;
    IERC20 public immutable quote;
    address public immutable registrar;
    address public immutable treasury;

    struct Launch {
        address token;
        uint256 nftId;
        address creator;
        address curveRecorder;
        address graduatedRecorder;
    }
    struct Credit { uint256 creator; uint256 studio; uint256 platform; }
    mapping(bytes32 => Launch) public launches;
    mapping(address => bytes32) public launchForToken;
    mapping(address => Credit) public credits;
    uint256 public liability;
    uint256 public totalCredited;
    uint256 public totalClaimed;

    error Unauthorized();
    error InvalidConfiguration();
    error UnknownLaunch();
    error AlreadyRegistered();
    error InvalidBeneficiary();
    error InvalidAmount();
    error UnsupportedQuote();
    error Insolvent();
    error NothingToClaim();

    event LaunchRegistered(bytes32 indexed launchId, address indexed token, uint256 indexed nftId, address creator, address curveRecorder, address graduatedRecorder);
    event FeesCredited(bytes32 indexed launchId, address indexed studioOwner, address indexed creator, address recorder, uint256 creatorFee, uint256 studioFee, uint256 platformFee);
    event Claimed(address indexed beneficiary, uint256 creatorFee, uint256 studioFee, uint256 platformFee);

    constructor(IERC721 collection_, IERC20 quote_, address registrar_, address treasury_) {
        if (address(collection_).code.length == 0 || !collection_.supportsInterface(0x80ac58cd)
            || address(quote_).code.length == 0 || registrar_ == address(0)
            || treasury_ == address(0) || treasury_ == address(this)) revert InvalidConfiguration();
        collection = collection_; quote = quote_; registrar = registrar_; treasury = treasury_;
    }

    /// @dev The future factory must call this atomically during launch, never after a transfer.
    /// No registration changes or recorder replacements exist.
    function registerLaunch(bytes32 launchId, address token, uint256 nftId, address creator, address curveRecorder, address graduatedRecorder) external nonReentrant {
        if (msg.sender != registrar) revert Unauthorized();
        if (launches[launchId].token != address(0) || launchForToken[token] != bytes32(0)) revert AlreadyRegistered();
        if (launchId == bytes32(0) || token.code.length == 0 || token == address(quote)
            || curveRecorder == address(0) || graduatedRecorder == address(0)) revert InvalidConfiguration();
        if (creator == address(0) || creator == address(this) || collection.ownerOf(nftId) != creator) revert InvalidBeneficiary();
        launches[launchId] = Launch(token, nftId, creator, curveRecorder, graduatedRecorder);
        launchForToken[token] = launchId;
        emit LaunchRegistered(launchId, token, nftId, creator, curveRecorder, graduatedRecorder);
    }

    /// @notice Pull and credit precisely funded fee amounts; unrelated donations create no credit.
    /// @dev Recorders must enforce correct trade amounts, pool identity and market lifecycle.
    /// Funding and all credits revert together on any failure.
    function recordFees(bytes32 launchId, uint256 creatorFee, uint256 studioFee, uint256 platformFee) external nonReentrant {
        Launch memory launch = launches[launchId];
        if (launch.token == address(0)) revert UnknownLaunch();
        if (msg.sender != launch.curveRecorder && msg.sender != launch.graduatedRecorder) revert Unauthorized();
        uint256 amount = creatorFee + studioFee + platformFee;
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = quote.balanceOf(address(this));
        if (beforeBalance < liability) revert Insolvent();
        quote.safeTransferFrom(msg.sender, address(this), amount);
        if (quote.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedQuote();

        // Resolve after external funding, immediately before accrual. Claim never reads ownerOf.
        address owner = collection.ownerOf(launch.nftId);
        if (owner == address(0)) revert InvalidBeneficiary();
        // transferFrom can place the NFT in this vault without a receiver callback.
        // Preserve literal-owner credit and trading availability even in that case.
        // Self-owned credits remain funded liabilities, never donations or claimable
        // treasury revenue. _claim deliberately forbids self-payment; no rescue exists.
        credits[launch.creator].creator += creatorFee;
        credits[owner].studio += studioFee;
        credits[treasury].platform += platformFee;
        liability += amount;
        totalCredited += amount;
        emit FeesCredited(launchId, owner, launch.creator, msg.sender, creatorFee, studioFee, platformFee);
    }

    function claim() external nonReentrant { _claim(msg.sender); }

    /// @notice Anyone may trigger payment, but only the credited beneficiary receives assets.
    /// Allows custody contracts to receive their literal-owner credit without a claim callback.
    function claimFor(address beneficiary) external nonReentrant { _claim(beneficiary); }

    function _claim(address beneficiary) private {
        if (beneficiary == address(0) || beneficiary == address(this)) revert InvalidBeneficiary();
        Credit memory credit = credits[beneficiary];
        uint256 amount = credit.creator + credit.studio + credit.platform;
        if (amount == 0) revert NothingToClaim();
        uint256 beforeBalance = quote.balanceOf(address(this));
        if (beforeBalance < liability) revert Insolvent();
        uint256 recipientBefore = quote.balanceOf(beneficiary);
        delete credits[beneficiary];
        liability -= amount;
        totalClaimed += amount;
        quote.safeTransfer(beneficiary, amount);
        // Reject outgoing taxes/extra debits too. This is not a complete rebase/admin review.
        if (quote.balanceOf(address(this)) != beforeBalance - amount
            || quote.balanceOf(beneficiary) != recipientBefore + amount) revert UnsupportedQuote();
        emit Claimed(beneficiary, credit.creator, credit.studio, credit.platform);
    }
}
