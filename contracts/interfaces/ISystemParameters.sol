// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ISystemParameters
 * @dev System parameters contract interface
 */
interface ISystemParameters {
    /**
     * @dev Set APY for a period
     * @param period Period (in seconds)
     * @param apy Annual percentage yield (precision 1e18)
     */
    function setPeriodAPY(uint256 period, uint256 apy) external;
    
    /**
     * @dev Get APY for a period
     * @param period Period (in seconds)
     * @return Annual percentage yield
     */
    function getPeriodAPY(uint256 period) external view returns (uint256);
    
    /**
     * @dev Set minimum investment amount
     * @param amount Minimum investment amount
     */
    function setMinInvestmentAmount(uint256 amount) external;
    
    /**
     * @dev Get minimum investment amount
     * @return Minimum investment amount
     */
    function getMinInvestmentAmount() external view returns (uint256);
    
    /**
     * @dev Set maximum investment amount
     * @param amount Maximum investment amount
     */
    function setMaxInvestmentAmount(uint256 amount) external;
    
    /**
     * @dev Get maximum investment amount
     * @return Maximum investment amount
     */
    function getMaxInvestmentAmount() external view returns (uint256);
    
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
} 