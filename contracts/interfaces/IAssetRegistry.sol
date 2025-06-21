// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetRegistry
 * @dev Asset registry contract interface
 */
interface IAssetRegistry {
    /**
     * @dev Asset status enum
     */
    enum AssetStatus {
        Inactive,
        Active,
        Completed,
        Deprecated
    }
    
    /**
     * @dev Asset structure
     * @param assetId Asset ID
     * @param name Asset name
     * @param issuer Issuer
     * @param description Asset description
     * @param apy Annual percentage yield (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     * @param maxAmount Maximum total amount for investment
     * @param currentAmount Current invested amount
     * @param status Asset status
     * @param minInvestment Minimum investment amount
     * @param maxInvestment Maximum investment amount per user
     * @param period Investment period in seconds
     * @param addedTime Added time
     */
    struct Asset {
        uint256 assetId;
        string name;
        string issuer;
        string description;
        uint256 apy;
        uint256 maxAmount;
        uint256 currentAmount;
        AssetStatus status;
        uint256 minInvestment;
        uint256 maxInvestment;
        uint256 period;
        uint256 addedTime;
    }
    
    /**
     * @dev Operator role constant
     * @return Operator role
     */
    function OPERATOR_ROLE() external view returns (bytes32);
    
    /**
     * @dev Add asset
     * @param name Asset name
     * @param issuer Issuer
     * @param description Asset description
     * @param maxAmount Maximum investment amount
     * @param apy Annual percentage yield (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     * @param minInvestment Minimum investment amount
     * @param maxInvestment Maximum investment amount per user
     * @param period Investment period in seconds
     * @return Asset ID
     */
    function addAsset(
        string calldata name,
        string calldata issuer,
        string calldata description,
        uint256 maxAmount,
        uint256 apy,
        uint256 minInvestment,
        uint256 maxInvestment,
        uint256 period
    ) external returns (uint256);
    
    /**
     * @dev Disable asset
     * @param assetId Asset ID
     */
    function disableAsset(uint256 assetId) external;
    
    /**
     * @dev Enable asset
     * @param assetId Asset ID
     */
    function enableAsset(uint256 assetId) external;
    
    /**
     * @dev Complete asset (marks asset as fully subscribed or completed)
     * @param assetId Asset ID
     */
    function completeAsset(uint256 assetId) external;
    
    /**
     * @dev Deprecate asset (marks asset as deprecated for removal)
     * @param assetId Asset ID
     */
    function deprecateAsset(uint256 assetId) external;
    
    /**
     * @dev Update asset amount
     * @param assetId Asset ID
     * @param amount Amount
     * @param isRefund Whether it's a refund (true for refund, false for usage)
     */
    function updateAssetAmount(
        uint256 assetId,
        uint256 amount,
        bool isRefund
    ) external;
    
    /**
     * @dev Update asset APY
     * @param assetId Asset ID
     * @param apy New APY value (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     */
    function updateAssetAPY(uint256 assetId, uint256 apy) external;
    
    /**
     * @dev Update asset period
     * @param assetId Asset ID
     * @param period New period in seconds
     */
    function updateAssetPeriod(uint256 assetId, uint256 period) external;
    
    /**
     * @dev Validate investment
     * @param assetId Asset ID
     * @param amount Investment amount
     * @return Whether valid
     */
    function validateInvestment(
        uint256 assetId,
        uint256 amount
    ) external view returns (bool);
    
    /**
     * @dev Get asset information
     * @param assetId Asset ID
     * @return Asset information
     */
    function getAsset(uint256 assetId) external view returns (Asset memory);
    
    /**
     * @dev Get total asset count
     * @return Total asset count
     */
    function getAssetCount() external view returns (uint256);
    
    /**
     * @dev Get asset list
     * @param startIndex Start index
     * @param count Count
     * @return Asset list
     */
    function getAssets(
        uint256 startIndex,
        uint256 count
    ) external view returns (Asset[] memory);
    
    /**
     * @dev Get active asset list with pagination
     * @param startIndex Start index
     * @param count Count
     * @return Active asset list
     */
    function getActiveAssets(
        uint256 startIndex,
        uint256 count
    ) external view returns (Asset[] memory);
    
    /**
     * @dev Check if asset exists
     * @param assetId Asset ID
     * @return Whether asset exists
     */
    function assetExists(uint256 assetId) external view returns (bool);
    
    /**
     * @dev Pause contract
     */
    function pause() external;
    
    /**
     * @dev Unpause contract
     */
    function unpause() external;
} 