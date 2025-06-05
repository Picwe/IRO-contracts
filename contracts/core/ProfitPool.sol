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
    
    // Default reward token address
    IERC20Upgradeable private _rewardToken;
    
    // Total deposited profits
    uint256 private _totalDeposited;
    
    // Total withdrawn profits
    uint256 private _totalWithdrawn;
    
    // Last withdrawal time mapping
    mapping(address => uint256) private _lastWithdrawalTime;
    
    // Asset-specific profit pool balances for default token
    mapping(uint256 => uint256) private _assetProfitPools;
    
    // Asset-specific profit pool balances for custom tokens
    // assetId => token => balance
    mapping(uint256 => mapping(address => uint256)) private _assetTokenProfitPools;
    
    // Event definitions
    event ProfitDeposited(address indexed depositor, uint256 amount);
    event ProfitDepositedForAsset(address indexed depositor, uint256 indexed assetId, uint256 amount);
    event ProfitDepositedForAssetWithToken(address indexed depositor, uint256 indexed assetId, uint256 amount, address token);
    event ProfitWithdrawn(address indexed recipient, uint256 amount);
    event ProfitWithdrawnFromAsset(address indexed recipient, uint256 indexed assetId, uint256 amount);
    event ProfitWithdrawnFromAssetWithToken(address indexed recipient, uint256 indexed assetId, uint256 amount, address token);
    event EmergencyWithdrawal(address indexed recipient, uint256 amount);
    event RewardTokenUpdated(address indexed oldToken, address indexed newToken);
    
    /**
     * @dev Initialization function, replaces constructor
     * @param admin Admin address
     * @param systemParameters System parameters contract address
     * @param assetRegistry Asset registry contract address
     * @param rewardToken Reward token address
     */
    function initialize(
        address admin,
        address systemParameters,
        address assetRegistry,
        address rewardToken
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
        
        // Set reward token
        _rewardToken = IERC20Upgradeable(rewardToken);
        
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
     * @dev Update reward token address
     * @param newRewardToken New reward token address
     */
    function updateRewardToken(address newRewardToken) 
        external 
        onlyAdmin 
    {
        require(newRewardToken != address(0), "ProfitPool: new token cannot be zero address");
        address oldToken = address(_rewardToken);
        _rewardToken = IERC20Upgradeable(newRewardToken);
        emit RewardTokenUpdated(oldToken, newRewardToken);
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
        return address(_rewardToken);
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
        uint256 balance = _rewardToken.balanceOf(address(this));
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
     * @dev Ensures asset profit pool has sufficient balance for a specific token
     * @param assetId Asset ID
     * @param amount Withdrawal amount
     * @param token Token address
     */
    modifier sufficientAssetTokenBalance(uint256 assetId, uint256 amount, address token) {
        require(
            _assetTokenProfitPools[assetId][token] >= amount,
            "ProfitPool: insufficient asset token profit pool balance"
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
     * @dev Deposit profit to asset-specific profit pool using default token
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
        _rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDepositedForAsset(msg.sender, assetId, amount);
    }
    
    /**
     * @dev Deposit profit to asset-specific profit pool with a specific token
     * @param assetId Asset ID
     * @param amount Profit amount
     * @param token Token address
     */
    function depositProfitForAssetWithToken(uint256 assetId, uint256 amount, address token) 
        external 
        override 
        nonReentrant 
        assetExists(assetId) 
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        require(token != address(0), "ProfitPool: token cannot be zero address");
        
        // Update asset profit pool balance for the specific token
        _assetTokenProfitPools[assetId][token] += amount;
        
        // Update statistics (still track in total)
        _totalDeposited += amount;
        
        // Transfer tokens to contract
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDepositedForAssetWithToken(msg.sender, assetId, amount, token);
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
        _rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDeposited(msg.sender, amount);
    }
    
    /**
     * @dev Withdraw profit from asset-specific profit pool using default token
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
        _rewardToken.safeTransfer(msg.sender, amount);
        
        emit ProfitWithdrawnFromAsset(msg.sender, assetId, amount);
    }
    
    /**
     * @dev Withdraw profit from asset-specific profit pool with a specific token
     * @param assetId Asset ID
     * @param amount Profit amount
     * @param token Token address
     */
    function withdrawProfitFromAssetWithToken(
        uint256 assetId, 
        uint256 amount,
        address token
    ) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        onlyOperator 
        assetExists(assetId)
        sufficientAssetTokenBalance(assetId, amount, token)
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        require(token != address(0), "ProfitPool: token cannot be zero address");
        
        // Update asset profit pool balance for the specific token
        _assetTokenProfitPools[assetId][token] -= amount;
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Update last withdrawal time
        _lastWithdrawalTime[msg.sender] = block.timestamp;
        
        // Transfer reward tokens to msg.sender
        IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
        
        emit ProfitWithdrawnFromAssetWithToken(msg.sender, assetId, amount, token);
    }
    
    /**
     * @dev Withdraw profit
     * @param amount Profit amount
     * @param recipient Recipient address
     */
    function withdrawProfit(uint256 amount, address recipient) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        onlyOperator 
        withdrawalCooldownPassed 
        sufficientBalance(amount)
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        require(recipient != address(0), "ProfitPool: recipient cannot be zero address");
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Update last withdrawal time
        _lastWithdrawalTime[msg.sender] = block.timestamp;
        
        // Transfer reward tokens to recipient
        _rewardToken.safeTransfer(recipient, amount);
        
        emit ProfitWithdrawn(recipient, amount);
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
        
        uint256 balance = _rewardToken.balanceOf(address(this));
        require(balance > 0, "ProfitPool: no balance to withdraw");
        
        // Update statistics
        _totalWithdrawn += balance;
        
        // Transfer all tokens to recipient
        _rewardToken.safeTransfer(recipient, balance);
        
        emit EmergencyWithdrawal(recipient, balance);
    }
    
    /**
     * @dev Get asset-specific profit pool balance for default token
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
     * @dev Get asset-specific profit pool balance for a specific token
     * @param assetId Asset ID
     * @param token Token address
     * @return Balance amount
     */
    function getAssetBalanceWithToken(uint256 assetId, address token) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _assetTokenProfitPools[assetId][token];
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
        return _rewardToken.balanceOf(address(this));
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