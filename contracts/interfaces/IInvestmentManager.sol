// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IInvestmentManager
 * @dev Investment manager contract interface
 */
interface IInvestmentManager {
    /**
     * @dev Investment status enum
     * @param Invalid Invalid status
     * @param Active Active
     * @param Completed Completed
     * @param Cancelled Cancelled
     */
    enum InvestmentStatus {
        Invalid,
        Active,
        Completed,
        Cancelled
    }
    
    /**
     * @dev Investment structure
     * @param investmentId Investment ID
     * @param investor Investor address
     * @param assetId Asset ID
     * @param amount Investment amount
     * @param startTime Start time
     * @param endTime End time
     * @param period Investment period (in seconds)
     * @param apy APY (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     * @param status Investment status
     * @param profit Profit amount
     * @param claimedProfit Claimed profit
     */
    struct Investment {
        uint256 investmentId;
        address investor;
        uint256 assetId;
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        uint256 period;
        uint256 apy;
        InvestmentStatus status;
        uint256 profit;
        uint256 claimedProfit;
    }
    
    /**
     * @dev User investment summary
     * @param totalInvestment Total investment amount
     * @param totalActiveInvestment Total active investment amount
     * @param totalProfit Total profit
     * @param totalClaimedProfit Total claimed profit
     * @param activeInvestmentCount Active investment count
     * @param totalInvestmentCount Total investment count
     */
    struct UserInvestmentSummary {
        uint256 totalInvestment;
        uint256 totalActiveInvestment;
        uint256 totalProfit;
        uint256 totalClaimedProfit;
        uint256 activeInvestmentCount;
        uint256 totalInvestmentCount;
    }
    
    /**
     * @dev Paginated investments result structure
     * @param investments Array of investments for the current page
     * @param totalCount Total number of investments for the user
     * @param hasNextPage Whether there are more pages
     */
    struct PaginatedInvestments {
        Investment[] investments;
        uint256 totalCount;
        bool hasNextPage;
    }
    
    /**
     * @dev Get investment token address
     * @return Investment token address
     */
    function getInvestmentToken() external view returns (address);
    
    /**
     * @dev Get reward token address
     * @return Reward token address
     */
    function getRewardToken() external view returns (address);
    
    /**
     * @dev Invest in an asset
     * @param assetId Asset ID
     * @param amount Investment amount
     * @return Investment ID
     */
    function invest(
        uint256 assetId,
        uint256 amount
    ) external returns (uint256);
    
    /**
     * @dev Calculate investment profit
     * @param investmentId Investment ID
     * @return Profit amount
     */
    function calculateProfit(uint256 investmentId) external view returns (uint256);
    
    /**
     * @dev Redeem investment and profit
     * @param investmentId Investment ID
     * @return Profit amount
     */
    function redeem(uint256 investmentId) external returns (uint256);
    
    /**
     * @dev Emergency cancel investment, only callable by admin
     * @param investmentId Investment ID
     */
    function emergencyCancel(uint256 investmentId) external;
    
    /**
     * @dev Add user to blacklist
     * @param account User address
     */
    function addToBlacklist(address account) external;
    
    /**
     * @dev Remove user from blacklist
     * @param account User address
     */
    function removeFromBlacklist(address account) external;
    

    
    /**
     * @dev Pause contract
     */
    function pause() external;
    
    /**
     * @dev Unpause contract
     */
    function unpause() external;
    
    /**
     * @dev Get investment information
     * @param investmentId Investment ID
     * @return Investment information
     */
    function getInvestment(uint256 investmentId) external view returns (Investment memory);
    
    /**
     * @dev Get all investment IDs for a user
     * @param account User address
     * @return Investment ID array
     */
    function getUserInvestments(address account) external view returns (uint256[] memory);
    
    /**
     * @dev Check if user is blacklisted
     * @param account User address
     * @return Whether user is blacklisted
     */
    function isBlacklisted(address account) external view returns (bool);
    

    
    /**
     * @dev Get user investment summary
     * @param account User address
     * @return Investment summary
     */
    function getUserInvestmentSummary(address account) external view returns (UserInvestmentSummary memory);
    
    /**
     * @dev Get user investments with pagination
     * @param account User address
     * @param offset Starting index (0-based)
     * @param limit Maximum number of investments to return
     * @return Paginated investments result
     */
    function getUserInvestmentsPaginated(
        address account, 
        uint256 offset, 
        uint256 limit
    ) external view returns (PaginatedInvestments memory);
} 