// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IProfitPool
 * @dev Profit pool contract interface
 */
interface IProfitPool {
    // Operator role constant
    function OPERATOR_ROLE() external view returns (bytes32);
    
    /**
     * @dev Get reward token address
     * @return Reward token address
     */
    function getRewardToken() external view returns (address);
    
    /**
     * @dev Deposit profit to a specific asset's profit pool
     * @param assetId Asset ID
     * @param amount Profit amount
     */
    function depositProfitForAsset(uint256 assetId, uint256 amount) external;
    
    /**
     * @dev Deposit profit
     * @param amount Profit amount
     */
    function depositProfit(uint256 amount) external;
    
    /**
     * @dev Withdraw profit from a specific asset's profit pool
     * @param assetId Asset ID
     * @param amount Profit amount
     */
    function withdrawProfitFromAsset(uint256 assetId, uint256 amount) external;
    
    /**
     * @dev Withdraw profit
     * @param amount Profit amount
     */
    function withdrawProfit(uint256 amount) external;
    
    /**
     * @dev Emergency withdraw
     * @param recipient Recipient address
     */
    function emergencyWithdraw(address recipient) external;
    
    /**
     * @dev Get specific asset profit pool balance
     * @param assetId Asset ID
     * @return Profit pool balance
     */
    function getAssetBalance(uint256 assetId) external view returns (uint256);
    
    /**
     * @dev Get profit pool balance
     * @return Profit pool balance
     */
    function getBalance() external view returns (uint256);
    
    /**
     * @dev Get total deposited profit
     * @return Total deposited profit
     */
    function getTotalDeposited() external view returns (uint256);
    
    /**
     * @dev Get total withdrawn profit
     * @return Total withdrawn profit
     */
    function getTotalWithdrawn() external view returns (uint256);
    
    /**
     * @dev Get last withdrawal time for an address
     * @param account Account address
     * @return Last withdrawal timestamp
     */
    function getLastWithdrawalTime(address account) external view returns (uint256);
    
    /**
     * @dev Pause contract
     */
    function pause() external;
    
    /**
     * @dev Unpause contract
     */
    function unpause() external;
} 