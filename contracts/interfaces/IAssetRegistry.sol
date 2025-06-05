// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetRegistry
 * @dev Asset registry contract interface
 */
interface IAssetRegistry {
    /**
     * @dev Asset structure
     * @param assetId Asset ID
     * @param name Asset name
     * @param issuer Issuer
     * @param totalAmount Total amount
     * @param usedAmount Used amount
     * @param remainingAmount Remaining amount
     * @param apy Annual percentage yield (precision 1e18)
     * @param isActive Whether active
     * @param addedTime Added time
     */
    struct Asset {
        uint256 assetId;
        string name;
        string issuer;
        uint256 totalAmount;
        uint256 usedAmount;
        uint256 remainingAmount;
        uint256 apy;
        bool isActive;
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
     * @param totalAmount Total amount
     * @param apy Annual percentage yield (precision 1e18)
     * @return Asset ID
     */
    function addAsset(
        string calldata name,
        string calldata issuer,
        uint256 totalAmount,
        uint256 apy
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
     * @param apy New APY value (precision 1e18)
     */
    function updateAssetAPY(uint256 assetId, uint256 apy) external;
    
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
     * @dev Get all active asset list
     * @return Active asset list
     */
    function getActiveAssets() external view returns (Asset[] memory);
} 