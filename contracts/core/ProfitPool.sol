// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IProfitPool.sol";
import "../interfaces/ISystemParameters.sol";
import "../interfaces/IAssetRegistry.sol";

/**
 * @title ProfitPool
 * @dev Profit pool contract for managing profits
 */
contract ProfitPool is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IProfitPool 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant override OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    // System parameters contract
    ISystemParameters private _systemParameters;
    
    // Asset registry contract
    IAssetRegistry private _assetRegistry;
    
    // Total deposited profits
    uint256 private _totalDeposited;
    
    // Total withdrawn profits
    uint256 private _totalWithdrawn;
    
    // Last withdrawal time mapping
    mapping(address => uint256) private _lastWithdrawalTime;
    
    // Asset-specific profit pool balances
    mapping(uint256 => uint256) private _assetProfitPools;
    
    // Event definitions
    event ProfitDeposited(address indexed depositor, uint256 amount);
    event ProfitDepositedForAsset(address indexed depositor, uint256 indexed assetId, uint256 amount);
    event ProfitWithdrawn(address indexed recipient, uint256 amount);
    event ProfitWithdrawnFromAsset(address indexed recipient, uint256 indexed assetId, uint256 amount);
    event EmergencyWithdrawal(address indexed recipient, uint256 amount);
    
    /**
     * @dev Initialization function, replaces constructor
     * @param admin Admin address
     * @param systemParameters System parameters contract address
     * @param assetRegistry Asset registry contract address
     */
    function initialize(
        address admin,
        address systemParameters,
        address assetRegistry
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        // Set roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        
        // Set system parameters contract
        _systemParameters = ISystemParameters(systemParameters);
        
        // Set asset registry contract
        _assetRegistry = IAssetRegistry(assetRegistry);
        
        // Initialize statistics
        _totalDeposited = 0;
        _totalWithdrawn = 0;
    }
    
    /**
     * @dev Ensures caller has admin role
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "ProfitPool: caller is not an admin");
        _;
    }
    
    /**
     * @dev Ensures caller has operator role
     */
    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "ProfitPool: caller is not an operator");
        _;
    }
    
    /**
     * @dev Get reward token address
     * @return Reward token address
     */
    function getRewardToken() 
        external 
        view 
        returns (address) 
    {
        return _systemParameters.getPlatformToken();
    }
    
    /**
     * @dev Ensures withdrawal cooldown period has passed
     */
    modifier withdrawalCooldownPassed() {
        uint256 cooldown = _systemParameters.getProfitWithdrawalCooldown();
        require(
            block.timestamp - _lastWithdrawalTime[msg.sender] >= cooldown,
            "ProfitPool: withdrawal cooldown not passed"
        );
        _;
    }
    
    /**
     * @dev Ensures profit pool has sufficient balance
     * @param amount Withdrawal amount
     */
    modifier sufficientBalance(uint256 amount) {
        uint256 balance = IERC20Upgradeable(_systemParameters.getPlatformToken()).balanceOf(address(this));
        uint256 minBalance = _systemParameters.getProfitPoolMinBalance();
        require(
            balance >= amount + minBalance,
            "ProfitPool: insufficient balance"
        );
        _;
    }
    
    /**
     * @dev Ensures asset profit pool has sufficient balance
     * @param assetId Asset ID
     * @param amount Withdrawal amount
     */
    modifier sufficientAssetBalance(uint256 assetId, uint256 amount) {
        require(
            _assetProfitPools[assetId] >= amount,
            "ProfitPool: insufficient asset profit pool balance"
        );
        _;
    }
    
    /**
     * @dev Ensures asset exists
     * @param assetId Asset ID
     */
    modifier assetExists(uint256 assetId) {
        require(
            _assetRegistry.assetExists(assetId),
            "ProfitPool: asset does not exist"
        );
        _;
    }
    
    /**
     * @dev Deposit profit to asset-specific profit pool
     * @param assetId Asset ID
     * @param amount Profit amount
     */
    function depositProfitForAsset(uint256 assetId, uint256 amount) 
        external 
        override 
        nonReentrant 
        assetExists(assetId) 
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        
        // Update asset profit pool balance
        _assetProfitPools[assetId] += amount;
        
        // Update statistics
        _totalDeposited += amount;
        
        // Transfer tokens to contract
        IERC20Upgradeable(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDepositedForAsset(msg.sender, assetId, amount);
    }
    
    /**
     * @dev Deposit profit
     * @param amount Profit amount
     */
    function depositProfit(uint256 amount) external override nonReentrant {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        
        // Update statistics
        _totalDeposited += amount;
        
        // Transfer tokens to contract
        IERC20Upgradeable(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDeposited(msg.sender, amount);
    }
    
    /**
     * @dev Withdraw profit from asset-specific profit pool
     * @param assetId Asset ID
     * @param amount Profit amount
     */
    function withdrawProfitFromAsset(
        uint256 assetId, 
        uint256 amount
    ) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        onlyOperator 
        assetExists(assetId)
        sufficientAssetBalance(assetId, amount)
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        
        // Update asset profit pool balance
        _assetProfitPools[assetId] -= amount;
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Update last withdrawal time
        _lastWithdrawalTime[msg.sender] = block.timestamp;
        
        // Transfer reward tokens to msg.sender
        IERC20Upgradeable(_systemParameters.getPlatformToken()).safeTransfer(msg.sender, amount);
        
        emit ProfitWithdrawnFromAsset(msg.sender, assetId, amount);
    }
    
    /**
     * @dev Withdraw profit
     * @param amount Profit amount
     */
    function withdrawProfit(uint256 amount) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        onlyOperator 
        withdrawalCooldownPassed 
        sufficientBalance(amount)
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Update last withdrawal time
        _lastWithdrawalTime[msg.sender] = block.timestamp;
        
        // Transfer reward tokens to msg.sender
        IERC20Upgradeable(_systemParameters.getPlatformToken()).safeTransfer(msg.sender, amount);
        
        emit ProfitWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Emergency withdrawal of all profits
     * @param recipient Recipient address
     */
    function emergencyWithdraw(address recipient) 
        external 
        override 
        nonReentrant 
        onlyAdmin 
    {
        require(recipient != address(0), "ProfitPool: recipient cannot be zero address");
        
        uint256 balance = IERC20Upgradeable(_systemParameters.getPlatformToken()).balanceOf(address(this));
        require(balance > 0, "ProfitPool: no balance to withdraw");
        
        // Update statistics
        _totalWithdrawn += balance;
        
        // Transfer all tokens to recipient
        IERC20Upgradeable(_systemParameters.getPlatformToken()).safeTransfer(recipient, balance);
        
        emit EmergencyWithdrawal(recipient, balance);
    }
    
    /**
     * @dev Get asset-specific profit pool balance
     * @param assetId Asset ID
     * @return Balance amount
     */
    function getAssetBalance(uint256 assetId) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _assetProfitPools[assetId];
    }
    
    /**
     * @dev Get profit pool balance
     * @return Balance amount
     */
    function getBalance() 
        external 
        view 
        override 
        returns (uint256) 
    {
        return IERC20Upgradeable(_systemParameters.getPlatformToken()).balanceOf(address(this));
    }
    
    /**
     * @dev Get total deposited profits
     * @return Total deposited amount
     */
    function getTotalDeposited() 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _totalDeposited;
    }
    
    /**
     * @dev Get total withdrawn profits
     * @return Total withdrawn amount
     */
    function getTotalWithdrawn() 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _totalWithdrawn;
    }
    
    /**
     * @dev Get last withdrawal time for an address
     * @param account Account address
     * @return Last withdrawal timestamp
     */
    function getLastWithdrawalTime(address account) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _lastWithdrawalTime[account];
    }
    
    /**
     * @dev Pause contract
     */
    function pause() 
        external 
        override 
        onlyAdmin 
    {
        _pause();
    }
    
    /**
     * @dev Unpause contract
     */
    function unpause() 
        external 
        override 
        onlyAdmin 
    {
        _unpause();
    }
    
    /**
     * @dev Execute upgrade authorization check
     * @param newImplementation New implementation contract address
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}
} 