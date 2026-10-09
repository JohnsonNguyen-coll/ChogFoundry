// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed supply: no owner, external mint, tax, blacklist or upgrade entry point.
contract StudioToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply_, address recipient_) ERC20(name_, symbol_) {
        require(supply_ > 0 && recipient_ != address(0), "invalid supply/recipient");
        _mint(recipient_, supply_);
    }
}
