// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StudioToken} from "./StudioToken.sol";
import {CreatorVesting} from "./CreatorVesting.sol";

/// @notice Source implementation under development; NOT deployed or audited.
/// The protocol market is immutable, not an arbitrary creator-selected recipient.
/// Launch/graduation/fee market integration must be completed before deployment.
contract StudioTokenFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC721 public immutable collection;
    address public immutable market;
    struct Launch { uint256 nftId; address creator; address token; address vesting; uint256 supply; uint256 creatorAllocation; }
    Launch[] public launches;
    event TokenLaunched(uint256 indexed launchId, uint256 indexed nftId, address indexed token, address creator, address vesting, uint256 supply, uint256 creatorAllocation, uint64 vestingStart, uint64 vestingDuration);
    constructor(IERC721 collection_, address market_) {
        require(address(collection_).code.length > 0 && collection_.supportsInterface(0x80ac58cd), "invalid collection");
        require(market_.code.length > 0, "invalid market");
        collection = collection_; market = market_;
    }
    function launch(uint256 nftId, string calldata name, string calldata symbol, uint256 supply, uint256 creatorAllocation, uint64 vestingStart, uint64 vestingDuration) external nonReentrant returns (address tokenAddress) {
        require(collection.ownerOf(nftId) == msg.sender, "owner required");
        require(bytes(name).length > 0 && bytes(name).length <= 64 && bytes(symbol).length > 0 && bytes(symbol).length <= 12, "invalid metadata");
        require(supply > 0 && creatorAllocation < supply, "invalid allocation");
        if (creatorAllocation > 0) require(vestingDuration > 0 && vestingStart >= block.timestamp, "invalid vesting");
        else require(vestingStart == 0 && vestingDuration == 0, "unused vesting");
        StudioToken launched = new StudioToken(name, symbol, supply, address(this));
        tokenAddress = address(launched);
        IERC20 token = IERC20(tokenAddress);
        address vesting;
        if (creatorAllocation > 0) {
            vesting = address(new CreatorVesting(token, msg.sender, creatorAllocation, vestingStart, vestingDuration));
            token.safeTransfer(vesting, creatorAllocation);
        }
        token.safeTransfer(market, supply - creatorAllocation);
        uint256 launchId = launches.length;
        launches.push(Launch(nftId, msg.sender, tokenAddress, vesting, supply, creatorAllocation));
        emit TokenLaunched(launchId, nftId, tokenAddress, msg.sender, vesting, supply, creatorAllocation, vestingStart, vestingDuration);
    }
    function launchCount() external view returns (uint256) { return launches.length; }
}
