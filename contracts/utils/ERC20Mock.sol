// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC20Mock
 * @dev ERC20 token contract for testing
 */
contract ERC20Mock is ERC20, Ownable {
    uint8 private immutable _decimals;

    /**
     * @dev Constructor
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals_ Token decimals
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    /**
     * @dev Returns token decimals
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint tokens
     * @param to Recipient address
     * @param amount Amount
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens
     * @param from Address to burn from
     * @param amount Amount
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
} 