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
        string description,
        uint256 maxAmount,
        uint256 apy,
        uint256 minInvestment,
        uint256 maxInvestment,
        uint256 period
    );
    
    event AssetStatusUpdated(uint256 indexed assetId, AssetStatus status);
    
    event AssetAmountUpdated(
        uint256 indexed assetId,
        uint256 amount,
        bool isRefund,
        uint256 currentAmount
    );
    
    event AssetAPYUpdated(uint256 indexed assetId, uint256 apy);
    
    event AssetTokenUpdated(uint256 indexed assetId, address token);
    
    event AssetPeriodUpdated(uint256 indexed assetId, uint256 period);
    
    event AssetInvestmentTokenUpdated(uint256 indexed assetId, address investmentToken);
    
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
    ) external override onlyAdmin returns (uint256) {
        require(bytes(name).length > 0, "AssetRegistry: name cannot be empty");
        require(bytes(issuer).length > 0, "AssetRegistry: issuer cannot be empty");
        require(maxAmount > 0, "AssetRegistry: maxAmount must be greater than 0");
        require(apy > 0, "AssetRegistry: apy must be greater than 0");
        require(period > 0, "AssetRegistry: period must be greater than 0");
        require(minInvestment > 0, "AssetRegistry: minInvestment must be greater than 0");
        require(maxInvestment >= minInvestment, "AssetRegistry: maxInvestment must be >= minInvestment");
        require(maxAmount >= maxInvestment, "AssetRegistry: maxAmount must be >= maxInvestment");
        
        uint256 assetId = _nextAssetId++;
        Asset storage asset = _assets[assetId];
        asset.assetId = assetId;
        asset.name = name;
        asset.issuer = issuer;
        asset.description = description;
        asset.maxAmount = maxAmount;
        asset.currentAmount = 0;
        asset.apy = apy;
        asset.status = AssetStatus.Active;
        asset.minInvestment = minInvestment;
        asset.maxInvestment = maxInvestment;
        asset.period = period;
        asset.addedTime = block.timestamp;
        
        _assetIds.push(assetId);
        
        emit AssetAdded(
            assetId, 
            name, 
            issuer, 
            description, 
            maxAmount, 
            apy, 
            minInvestment, 
            maxInvestment, 
            period
        );
        
        return assetId;
    }
    
    /**
     * @dev Disable asset
     * @param assetId Asset ID
     */
    function disableAsset(uint256 assetId) external override onlyAdmin assetExists(assetId) {
        require(_assets[assetId].status == AssetStatus.Active, "AssetRegistry: asset is not active");
        _assets[assetId].status = AssetStatus.Inactive;
        emit AssetStatusUpdated(assetId, AssetStatus.Inactive);
    }
    
    /**
     * @dev Enable asset
     * @param assetId Asset ID
     */
    function enableAsset(uint256 assetId) external override onlyAdmin assetExists(assetId) {
        require(_assets[assetId].status == AssetStatus.Inactive, "AssetRegistry: asset is not inactive");
        _assets[assetId].status = AssetStatus.Active;
        emit AssetStatusUpdated(assetId, AssetStatus.Active);
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
            // Refund: decrease current amount
            require(asset.currentAmount >= amount, "AssetRegistry: insufficient current amount");
            asset.currentAmount -= amount;
        } else {
            // Usage: increase current amount
            require(asset.currentAmount + amount <= asset.maxAmount, "AssetRegistry: would exceed max amount");
            asset.currentAmount += amount;
        }
        
        emit AssetAmountUpdated(assetId, amount, isRefund, asset.currentAmount);
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
        if (asset.status != AssetStatus.Active) {
            return false;
        }
        
        // Check investment limits
        if (amount < asset.minInvestment || amount > asset.maxInvestment) {
            return false;
        }
        
        // Check if capacity is available
        if (asset.currentAmount + amount > asset.maxAmount) {
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
     * @dev Get active assets with pagination
     * @param startIndex Start index
     * @param count Count
     * @return Active asset list
     */
    function getActiveAssets(
        uint256 startIndex,
        uint256 count
    ) external view override returns (Asset[] memory) {
        // First pass: count active assets
        uint256 activeCount = 0;
        for (uint256 i = 0; i < _assetIds.length; i++) {
            if (_assets[_assetIds[i]].status == AssetStatus.Active) {
                activeCount++;
            }
        }
        
        if (activeCount == 0) {
            return new Asset[](0);
        }
        
        // Validate startIndex
        require(startIndex < activeCount, "AssetRegistry: startIndex out of bounds");
        
        // Calculate actual count
        uint256 actualCount = count;
        if (startIndex + count > activeCount) {
            actualCount = activeCount - startIndex;
        }
        
        // Second pass: collect active assets with pagination
        Asset[] memory activeAssets = new Asset[](actualCount);
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;
        
        for (uint256 i = 0; i < _assetIds.length && resultIndex < actualCount; i++) {
            if (_assets[_assetIds[i]].status == AssetStatus.Active) {
                if (currentIndex >= startIndex) {
                    activeAssets[resultIndex] = _assets[_assetIds[i]];
                    resultIndex++;
                }
                currentIndex++;
            }
        }
        
        return activeAssets;
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
} 