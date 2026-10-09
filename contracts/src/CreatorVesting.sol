// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Immutable creator beneficiary, independent of future NFT owners.
/// Fixed allocation and linear schedule; later token donations do not enlarge creator allocation.
contract CreatorVesting is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public immutable allocation;
    uint64 public immutable start;
    uint64 public immutable duration;
    uint256 public released;
    event Released(address indexed beneficiary, uint256 amount);

    constructor(IERC20 token_, address beneficiary_, uint256 allocation_, uint64 start_, uint64 duration_) {
        require(address(token_).code.length > 0 && beneficiary_ != address(0), "invalid token/beneficiary");
        require(allocation_ > 0 && duration_ > 0, "invalid schedule");
        token = token_; beneficiary = beneficiary_; allocation = allocation_; start = start_; duration = duration_;
    }
    function vested(uint256 timestamp) public view returns (uint256) {
        if (timestamp <= start) return 0;
        if (timestamp >= uint256(start) + duration) return allocation;
        return allocation * (timestamp - start) / duration;
    }
    function releasable() public view returns (uint256) { return vested(block.timestamp) - released; }
    function release() external nonReentrant {
        uint256 amount = releasable();
        require(amount > 0, "nothing vested");
        released += amount;
        token.safeTransfer(beneficiary, amount);
        emit Released(beneficiary, amount);
    }
}
