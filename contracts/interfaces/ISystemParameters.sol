// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ISystemParameters
 * @dev System parameters contract interface
 */
interface ISystemParameters {

    
    /**
     * @dev Set investment cooldown period
     * @param cooldown Cooldown period (in seconds)
     */
    function setInvestmentCooldown(uint256 cooldown) external;
    
    /**
     * @dev Get investment cooldown period
     * @return Cooldown period (in seconds)
     */
    function getInvestmentCooldown() external view returns (uint256);
    
    /**
     * @dev Set profit pool minimum balance
     * @param amount Minimum balance
     */
    function setProfitPoolMinBalance(uint256 amount) external;
    
    /**
     * @dev Get profit pool minimum balance
     * @return Minimum balance
     */
    function getProfitPoolMinBalance() external view returns (uint256);
    
    /**
     * @dev Set profit withdrawal cooldown period
     * @param cooldown Cooldown period (in seconds)
     */
    function setProfitWithdrawalCooldown(uint256 cooldown) external;
    
    /**
     * @dev Get profit withdrawal cooldown period
     * @return Cooldown period (in seconds)
     */
    function getProfitWithdrawalCooldown() external view returns (uint256);
    
    /**
     * @dev Set platform token address
     * @param token Platform token address
     */
    function setPlatformToken(address token) external;
    
    /**
     * @dev Get platform token address
     * @return Platform token address
     */
    function getPlatformToken() external view returns (address);
} 