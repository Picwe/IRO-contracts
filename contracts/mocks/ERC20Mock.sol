// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC20Mock
 * @dev ERC20 token for testing purposes
 */
contract ERC20Mock is ERC20, Ownable {
    uint8 private _decimals;
    
    /**
     * @dev Constructor
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Token decimals
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }
    
    /**
     * @dev Mint tokens
     * @param to Recipient address
     * @param amount Amount
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
    
    /**
     * @dev Burn tokens
     * @param amount Amount
     */
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
    
    /**
     * @dev Get token decimals
     * @return Token decimals
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
} 