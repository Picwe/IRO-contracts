// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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
    
    // Emergency withdrawal timelock
    uint256 private constant EMERGENCY_TIMELOCK = 24 hours;
    
    // Struct to store emergency withdrawal request details - Fix PPO-2
    struct EmergencyWithdrawalRequest {
        address recipient;
        uint256 amount;
        uint256 executeAfter;
    }
    
    mapping(bytes32 => EmergencyWithdrawalRequest) private _emergencyWithdrawalRequests;
    
    // Event definitions
    event ProfitDeposited(address indexed depositor, uint256 amount);
    event ProfitDepositedForAsset(address indexed depositor, uint256 indexed assetId, uint256 amount);
    event ProfitWithdrawn(address indexed recipient, uint256 amount);
    event ProfitWithdrawnFromAsset(address indexed recipient, uint256 indexed assetId, uint256 amount);
    event EmergencyWithdrawal(address indexed recipient, uint256 amount);
    event EmergencyWithdrawalRequested(address indexed recipient, uint256 amount, bytes32 indexed requestId, uint256 executeAfter);
    event EmergencyWithdrawalExecuted(address indexed recipient, uint256 amount, bytes32 indexed requestId);
    
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
        
        // Set roles - Fix PPO-1: Correct role permission configuration
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        // Fix PPO-1: Set ADMIN_ROLE as admin of OPERATOR_ROLE 
        // This ensures grantOperatorRole function (which uses onlyAdmin) can properly manage OPERATOR_ROLE
        // Without this, there's a mismatch: grantOperatorRole checks ADMIN_ROLE but OPERATOR_ROLE is managed by DEFAULT_ADMIN_ROLE
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);
        
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
     * @dev Grant operator role to investment manager
     * @param investmentManager Investment manager contract address
     */
    function grantOperatorRole(address investmentManager) external onlyAdmin {
        require(investmentManager != address(0), "ProfitPool: investmentManager cannot be zero address");
        _grantRole(OPERATOR_ROLE, investmentManager);
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
        uint256 balance = IERC20(_systemParameters.getPlatformToken()).balanceOf(address(this));
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
     */
    modifier assetExists(uint256 assetId) {
        require(_assetRegistry.assetExists(assetId) && assetId > 0, "ProfitPool: asset does not exist");
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
        IERC20(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
        
        emit ProfitDepositedForAsset(msg.sender, assetId, amount);
    }
    
    /**
     * @dev Deposit profit
     * @param amount Profit amount
     */
    // function depositProfit(uint256 amount) external override nonReentrant {
    //     require(amount > 0, "ProfitPool: amount must be greater than 0");
        
    //     // Update statistics
    //     _totalDeposited += amount;
        
    //     // Transfer tokens to contract
    //     IERC20(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
        
    //     emit ProfitDeposited(msg.sender, amount);
    // }
    
    /**
     * @dev Withdraw profit from asset-specific profit pool
     * @param assetId Asset ID
     * @param amount Profit amount
     * @param user User address for whom the withdrawal is being made
     */
    function withdrawProfitFromAsset(
        uint256 assetId, 
        uint256 amount,
        address user
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
        require(user != address(0), "ProfitPool: user cannot be zero address");
        
        // Update asset profit pool balance
        _assetProfitPools[assetId] -= amount;
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Fix PPO-3: Update last withdrawal time for the actual user, not the contract
        _lastWithdrawalTime[user] = block.timestamp;
        
        // Transfer reward tokens to the user
        IERC20(_systemParameters.getPlatformToken()).safeTransfer(user, amount);
        
        emit ProfitWithdrawnFromAsset(user, assetId, amount);
    }
    
    /**
     * @dev Withdraw profit (for direct user access)
     * @param amount Profit amount
     */
    function withdrawProfit(uint256 amount) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        withdrawalCooldownPassed 
        sufficientBalance(amount)
    {
        require(amount > 0, "ProfitPool: amount must be greater than 0");
        
        // Update statistics
        _totalWithdrawn += amount;
        
        // Update last withdrawal time
        _lastWithdrawalTime[msg.sender] = block.timestamp;
        
        // Transfer reward tokens to msg.sender
        IERC20(_systemParameters.getPlatformToken()).safeTransfer(msg.sender, amount);
        
        emit ProfitWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Request emergency withdrawal (with timelock for security)
     * @param recipient Recipient address
     */
    function requestEmergencyWithdraw(address recipient) 
        external 
        onlyAdmin 
    {
        require(recipient != address(0), "ProfitPool: recipient cannot be zero address");
        
        uint256 balance = IERC20(_systemParameters.getPlatformToken()).balanceOf(address(this));
        require(balance > 0, "ProfitPool: no balance to withdraw");
        
        bytes32 requestId = keccak256(abi.encodePacked(recipient, balance, block.timestamp));
        uint256 executeAfter = block.timestamp + EMERGENCY_TIMELOCK;
        
        // Fix PPO-2: Store complete request details including original recipient
        _emergencyWithdrawalRequests[requestId] = EmergencyWithdrawalRequest({
            recipient: recipient,
            amount: balance,
            executeAfter: executeAfter
        });
        
        emit EmergencyWithdrawalRequested(recipient, balance, requestId, executeAfter);
    }

    /**
     * @dev Execute emergency withdrawal (after timelock expires)
     * @param recipient Recipient address
     * @param requestId Request ID from the request transaction
     */
    function executeEmergencyWithdraw(address recipient, bytes32 requestId) 
        external 
        nonReentrant 
        onlyAdmin 
    {
        require(recipient != address(0), "ProfitPool: recipient cannot be zero address");
        
        EmergencyWithdrawalRequest memory request = _emergencyWithdrawalRequests[requestId];
        require(request.executeAfter != 0, "ProfitPool: invalid request ID");
        require(block.timestamp >= request.executeAfter, "ProfitPool: timelock not expired");
        
        // Fix PPO-2: Validate recipient consistency between request and execution
        require(recipient == request.recipient, "ProfitPool: recipient mismatch with original request");
        
        uint256 balance = IERC20(_systemParameters.getPlatformToken()).balanceOf(address(this));
        require(balance > 0, "ProfitPool: no balance to withdraw");
        
        // Clear the request
        delete _emergencyWithdrawalRequests[requestId];
        
        // Update statistics
        _totalWithdrawn += balance;
        
        // Transfer all tokens to recipient
        IERC20(_systemParameters.getPlatformToken()).safeTransfer(recipient, balance);
        
        emit EmergencyWithdrawalExecuted(recipient, balance, requestId);
    }

    /**
     * @dev Emergency withdrawal of all profits (DEPRECATED - use requestEmergencyWithdraw instead)
     * @param recipient Recipient address
     */
    function emergencyWithdraw(address recipient) 
        external 
        override 
        nonReentrant 
        onlyAdmin 
    {
        // SECURITY: This method is now deprecated due to security concerns
        // All emergency withdrawals must go through the timelock mechanism
        revert("ProfitPool: use requestEmergencyWithdraw and executeEmergencyWithdraw instead");
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
        return IERC20(_systemParameters.getPlatformToken()).balanceOf(address(this));
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