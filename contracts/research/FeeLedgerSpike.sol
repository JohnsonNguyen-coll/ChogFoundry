// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

interface IOwnershipSource { function ownerOf(uint256 id) external view returns (address); }
interface IQuote {
    function balanceOf(address wallet) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice LOCAL SPIKE. No token factory, market, AMM, vesting or mainnet readiness.
/// Recorder is trusted and immutable: it stands in for a future market, not arbitrary users.
contract FeeLedgerSpike {
    struct Launch { uint256 nftId; address creator; uint16 creatorBps; uint16 studioBps; }
    IOwnershipSource public immutable collection;
    IQuote public immutable quote;
    address public immutable recorder;
    address public immutable treasury;
    uint256 public nextLaunchId;
    uint256 public liability;
    mapping(uint256 => Launch) public launches;
    mapping(address => uint256) public credits;
    bool private entered;

    event LaunchRegistered(uint256 indexed launchId, uint256 indexed nftId, address indexed creator, uint16 creatorBps, uint16 studioBps);
    event FeeCredited(uint256 indexed launchId, address indexed studioOwner, address indexed creator, uint256 creatorFee, uint256 studioFee, uint256 platformFee);
    event Claimed(address indexed beneficiary, uint256 amount);

    modifier nonReentrant() {
        require(!entered, "reentrant"); entered = true; _; entered = false;
    }
    constructor(address nft, address asset, address feeRecorder, address platform) {
        require(nft.code.length > 0 && asset.code.length > 0, "invalid contracts");
        require(feeRecorder != address(0) && platform != address(0), "zero address");
        collection = IOwnershipSource(nft); quote = IQuote(asset);
        recorder = feeRecorder; treasury = platform;
    }
    function registerLaunch(uint256 nftId, uint16 creatorBps, uint16 studioBps) external nonReentrant returns (uint256 id) {
        require(collection.ownerOf(nftId) == msg.sender, "owner required");
        require(uint256(creatorBps) + studioBps <= 10_000, "invalid split");
        id = ++nextLaunchId;
        launches[id] = Launch(nftId, msg.sender, creatorBps, studioBps);
        emit LaunchRegistered(id, nftId, msg.sender, creatorBps, studioBps);
    }
    function recordFee(uint256 id, uint256 amount) external nonReentrant {
        require(msg.sender == recorder, "recorder required");
        Launch memory launch = launches[id];
        require(launch.creator != address(0) && amount > 0, "invalid fee");
        // Snapshot at accrual, never at claim. Quote integration must exclude malicious/rebasing assets.
        address owner = collection.ownerOf(launch.nftId);
        require(owner != address(0), "owner unavailable");
        uint256 beforeBalance = quote.balanceOf(address(this));
        require(quote.transferFrom(msg.sender, address(this), amount), "transfer failed");
        require(quote.balanceOf(address(this)) == beforeBalance + amount, "unsupported quote");
        uint256 creatorFee = amount * launch.creatorBps / 10_000;
        uint256 studioFee = amount * launch.studioBps / 10_000;
        uint256 platformFee = amount - creatorFee - studioFee;
        credits[launch.creator] += creatorFee;
        credits[owner] += studioFee;
        credits[treasury] += platformFee;
        liability += amount;
        emit FeeCredited(id, owner, launch.creator, creatorFee, studioFee, platformFee);
    }
    function claim() external nonReentrant {
        uint256 amount = credits[msg.sender];
        require(amount > 0, "nothing to claim");
        credits[msg.sender] = 0;
        liability -= amount;
        require(quote.transfer(msg.sender, amount), "transfer failed");
        require(quote.balanceOf(address(this)) >= liability, "insolvent");
        emit Claimed(msg.sender, amount);
    }
}

