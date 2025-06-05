// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/IAssetRegistry.sol";
import "../interfaces/ISystemParameters.sol";

/**
 * @title AssetRegistry
 * @dev Asset registry contract for managing RWA asset information
 */
contract AssetRegistry is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable,
    IAssetRegistry 
{
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant override OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    // System parameters contract
    ISystemParameters private _systemParameters;
    
    // Asset mappings
    mapping(uint256 => Asset) private _assets;
    uint256[] private _assetIds;
    uint256 private _nextAssetId;
    
    // Event definitions
    event AssetAdded(
        uint256 indexed assetId,
        string name,
        string issuer,
        uint256 totalAmount,
        uint256 apy
    );
    
    event AssetStatusUpdated(uint256 indexed assetId, bool isActive);
    event AssetAmountUpdated(
        uint256 indexed assetId,
        uint256 amount,
        bool isRefund,
        uint256 remainingAmount
    );
    
    event AssetAPYUpdated(uint256 indexed assetId, uint256 apy);
    
    struct Asset {
        uint256 assetId;
        string name;
        string description;
        address token;
        uint256 apy;
        uint256 maxAmount;
        uint256 currentAmount;
        AssetStatus status;
        // Add investment parameters
        uint256 minInvestment;    // Minimum investment amount
        uint256 maxInvestment;    // Maximum investment amount
        uint256 period;          // Fixed investment period in seconds
    }
    
    /**
     * @dev Initialization function, replaces constructor
     * @param admin Admin address
     * @param systemParameters System parameters contract address
     */
    function initialize(address admin, address systemParameters) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        // Set roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        
        // Set system parameters contract
        _systemParameters = ISystemParameters(systemParameters);
        
        // Initialize asset ID
        _nextAssetId = 1;
    }
    
    /**
     * @dev Ensures caller has admin role
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "AssetRegistry: caller is not an admin");
        _;
    }
    
    /**
     * @dev Ensures caller has operator role
     */
    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "AssetRegistry: caller is not an operator");
        _;
    }
    
    /**
     * @dev Ensures asset exists
     */
    modifier assetExists(uint256 assetId) {
        require(_assets[assetId].assetId == assetId, "AssetRegistry: asset does not exist");
        _;
    }
    
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
    ) external override onlyAdmin returns (uint256) {
        require(bytes(name).length > 0, "AssetRegistry: name cannot be empty");
        require(bytes(issuer).length > 0, "AssetRegistry: issuer cannot be empty");
        require(totalAmount > 0, "AssetRegistry: totalAmount must be greater than 0");
        require(apy > 0, "AssetRegistry: apy must be greater than 0");
        
        uint256 assetId = _nextAssetId++;
        Asset storage asset = _assets[assetId];
        asset.assetId = assetId;
        asset.name = name;
        asset.issuer = issuer;
        asset.totalAmount = totalAmount;
        asset.usedAmount = 0;
        asset.remainingAmount = totalAmount;
        asset.apy = apy;
        asset.isActive = true;
        asset.addedTime = block.timestamp;
        
        _assetIds.push(assetId);
        
        emit AssetAdded(assetId, name, issuer, totalAmount, apy);
        
        return assetId;
    }
    
    /**
     * @dev Disable asset
     * @param assetId Asset ID
     */
    function disableAsset(uint256 assetId) external override onlyAdmin assetExists(assetId) {
        require(_assets[assetId].isActive, "AssetRegistry: asset is already disabled");
        _assets[assetId].isActive = false;
        emit AssetStatusUpdated(assetId, false);
    }
    
    /**
     * @dev Enable asset
     * @param assetId Asset ID
     */
    function enableAsset(uint256 assetId) external override onlyAdmin assetExists(assetId) {
        require(!_assets[assetId].isActive, "AssetRegistry: asset is already enabled");
        _assets[assetId].isActive = true;
        emit AssetStatusUpdated(assetId, true);
    }
    
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
    ) external override onlyOperator assetExists(assetId) {
        Asset storage asset = _assets[assetId];
        
        if (isRefund) {
            // Refund: decrease used amount, increase remaining amount
            asset.usedAmount -= amount;
            asset.remainingAmount += amount;
        } else {
            // Usage: increase used amount, decrease remaining amount
            require(asset.remainingAmount >= amount, "AssetRegistry: insufficient remaining amount");
            asset.usedAmount += amount;
            asset.remainingAmount -= amount;
        }
        
        emit AssetAmountUpdated(assetId, amount, isRefund, asset.remainingAmount);
    }
    
    /**
     * @dev Validate investment
     * @param assetId Asset ID
     * @param amount Investment amount
     * @return Whether valid
     */
    function validateInvestment(
        uint256 assetId,
        uint256 amount
    ) external view override assetExists(assetId) returns (bool) {
        Asset storage asset = _assets[assetId];
        
        // Check if asset is active
        if (!asset.isActive) {
            return false;
        }
        
        // Check if remaining amount is sufficient
        if (asset.remainingAmount < amount) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Get asset information
     * @param assetId Asset ID
     * @return Asset information
     */
    function getAsset(uint256 assetId) external view override assetExists(assetId) returns (Asset memory) {
        return _assets[assetId];
    }
    
    /**
     * @dev Get total number of assets
     * @return Total number of assets
     */
    function getAssetCount() external view override returns (uint256) {
        return _assetIds.length;
    }
    
    /**
     * @dev Get asset list
     * @param startIndex Start index
     * @param count Count
     * @return Asset list
     */
    function getAssets(
        uint256 startIndex,
        uint256 count
    ) external view override returns (Asset[] memory) {
        require(startIndex < _assetIds.length, "AssetRegistry: startIndex out of bounds");
        
        uint256 endIndex = startIndex + count;
        if (endIndex > _assetIds.length) {
            endIndex = _assetIds.length;
        }
        
        Asset[] memory assets = new Asset[](endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            assets[i - startIndex] = _assets[_assetIds[i]];
        }
        
        return assets;
    }
    
    /**
     * @dev Check if asset exists
     * @param assetId Asset ID
     * @return Whether asset exists
     */
    function assetExists(uint256 assetId) external view override returns (bool) {
        return _assets[assetId].assetId == assetId;
    }
    
    /**
     * @dev Pause contract
     */
    function pause() external override onlyAdmin {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() external override onlyAdmin {
        _unpause();
    }
    
    /**
     * @dev Execute upgrade authorization check
     * @param newImplementation New implementation contract address
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyAdmin
    {}
    
    /**
     * @dev Update asset APY
     * @param assetId Asset ID
     * @param apy New APY value (precision 1e18)
     */
    function updateAssetAPY(uint256 assetId, uint256 apy) external override onlyAdmin assetExists(assetId) {
        require(apy > 0, "AssetRegistry: apy must be greater than 0");
        _assets[assetId].apy = apy;
        emit AssetAPYUpdated(assetId, apy);
    }
} 