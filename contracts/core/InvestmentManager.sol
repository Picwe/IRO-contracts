// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IInvestmentManager.sol";
import "../interfaces/IAssetRegistry.sol";
import "../interfaces/IProfitPool.sol";
import "../interfaces/ISystemParameters.sol";

/**
 * @title InvestmentManager
 * @dev Investment management contract for managing investments and profits
 */
contract InvestmentManager is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IInvestmentManager 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // System parameters contract
    ISystemParameters private _systemParameters;
    
    // Asset registry contract
    IAssetRegistry private _assetRegistry;
    
    // Profit pool contract
    IProfitPool private _profitPool;
    
    // weUSD token address
    IERC20Upgradeable private _weUSD;
    
    // Investment mappings
    mapping(uint256 => Investment) private _investments;
    uint256 private _nextInvestmentId;
    
    // User investment mappings
    mapping(address => uint256[]) private _userInvestments;
    
    // User last investment time mapping
    mapping(address => uint256) private _lastInvestmentTime;
    
    // Blacklist mapping
    mapping(address => bool) private _blacklist;
    
    // Event definitions
    event InvestmentCreated(
        uint256 indexed investmentId,
        address indexed investor,
        uint256 indexed assetId,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        uint256 period,
        uint256 apy
    );
    
    event ProfitClaimed(
        uint256 indexed investmentId,
        address indexed investor,
        uint256 amount
    );
    
    event InvestmentStatusUpdated(
        uint256 indexed investmentId,
        InvestmentStatus status
    );
    
    event BlacklistUpdated(address indexed account, bool status);
    
    /**
     * @dev Initialization function, replaces constructor
     * @param admin Admin address
     * @param systemParameters System parameters contract address
     * @param assetRegistry Asset registry contract address
     * @param profitPool Profit pool contract address
     * @param weUSD weUSD token address
     */
    function initialize(
        address admin,
        address systemParameters,
        address assetRegistry,
        address profitPool,
        address weUSD
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        // Set roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        // Set system parameters contract
        _systemParameters = ISystemParameters(systemParameters);
        
        // Set asset registry contract
        _assetRegistry = IAssetRegistry(assetRegistry);
        
        // Set profit pool contract
        _profitPool = IProfitPool(profitPool);
        
        // Set weUSD token
        _weUSD = IERC20Upgradeable(weUSD);
        
        // Initialize investment ID
        _nextInvestmentId = 1;
    }
    
    /**
     * @dev Ensures caller has admin role
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "InvestmentManager: caller is not an admin");
        _;
    }
    
    /**
     * @dev Ensures caller is the investment owner
     */
    modifier onlyInvestmentOwner(uint256 investmentId) {
        require(
            _investments[investmentId].investor == msg.sender,
            "InvestmentManager: caller is not the investment owner"
        );
        _;
    }
    
    /**
     * @dev Ensures investment exists
     */
    modifier investmentExists(uint256 investmentId) {
        require(_investments[investmentId].investmentId == investmentId, "InvestmentManager: investment does not exist");
        _;
    }
    
    /**
     * @dev Ensures user is not blacklisted
     */
    modifier notBlacklisted() {
        require(!_blacklist[msg.sender], "InvestmentManager: account is blacklisted");
        _;
    }
    
    /**
     * @dev Ensures investment cooldown period has passed
     */
    modifier investmentCooldownPassed() {
        uint256 cooldown = _systemParameters.getInvestmentCooldown();
        require(
            block.timestamp - _lastInvestmentTime[msg.sender] >= cooldown,
            "InvestmentManager: investment cooldown not passed"
        );
        _;
    }
    
    /**
     * @dev Invest in an asset
     * @param assetId Asset ID
     * @param amount Investment amount
     * @param period Investment period (in seconds)
     * @return Investment ID
     */
    function invest(
        uint256 assetId,
        uint256 amount
    ) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        notBlacklisted 
        investmentCooldownPassed
        returns (uint256) 
    {
        // Get asset information first to use its fields for validation
        IAssetRegistry.Asset memory asset = _assetRegistry.getAsset(assetId);
        
        // Validate investment using asset registry
        require(
            _assetRegistry.validateInvestment(assetId, amount),
            "InvestmentManager: invalid investment"
        );
        
        // Validate investment amount
        require(amount > 0, "InvestmentManager: amount must be greater than 0");
        require(amount >= asset.minInvestment, "InvestmentManager: amount below minimum investment");
        require(amount <= asset.maxInvestment, "InvestmentManager: amount above maximum investment");
        
        // Check if asset has reached its capacity
        require(
            asset.currentAmount + amount <= asset.maxAmount,
            "InvestmentManager: asset investment capacity reached"
        );
        
        
        // Calculate investment time
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + asset.period;
        
        // Create investment record
        uint256 investmentId = _nextInvestmentId++;
        Investment storage investment = _investments[investmentId];
        investment.investmentId = investmentId;
        investment.investor = msg.sender;
        investment.assetId = assetId;
        investment.amount = amount;
        investment.startTime = startTime;
        investment.endTime = endTime;
        investment.period = period;
        investment.apy = asset.apy;
        investment.status = InvestmentStatus.Active;
        investment.profit = 0;
        investment.claimedProfit = 0;
        
        // Update user investment list
        _userInvestments[msg.sender].push(investmentId);
        
        // Update last investment time
        _lastInvestmentTime[msg.sender] = block.timestamp;
        
        // Update asset balance
        _assetRegistry.updateAssetAmount(assetId, amount, false);
        
        // Transfer tokens to contract
        _weUSD.safeTransferFrom(msg.sender, address(this), amount);
        
        emit InvestmentCreated(
            investmentId,
            msg.sender,
            assetId,
            amount,
            startTime,
            endTime,
            period,
            investment.apy
        );
        
        return investmentId;
    }
    
    /**
     * @dev Calculate investment profit
     * @param investmentId Investment ID
     * @return Profit amount
     */
    function calculateProfit(uint256 investmentId) 
        public 
        view 
        override 
        investmentExists(investmentId) 
        returns (uint256) 
    {
        Investment storage investment = _investments[investmentId];
        
        // If investment is completed or cancelled, return 0
        if (investment.status != InvestmentStatus.Active) {
            return 0;
        }
        
        // Calculate current time
        uint256 currentTime = block.timestamp;
        
        // Calculate elapsed time
        uint256 elapsedTime;
        if (currentTime > investment.endTime) {
            elapsedTime = investment.endTime - investment.startTime;
        } else {
            elapsedTime = currentTime - investment.startTime;
        }
        
        // Improved profit calculation method to avoid overflow
        uint256 secondsInYear = 365 days;
        
        // First divide APY by precision to reduce number size
        uint256 scaledAPY = investment.apy / 1e12; // Reduce precision by 6 digits
        
        // Then calculate (amount * scaledAPY * elapsedTime) / (secondsInYear * 1e6)
        // This can avoid overflow in intermediate results
        uint256 profit = (investment.amount * scaledAPY * elapsedTime) / (secondsInYear * 1e6);
        
        return profit;
    }
    
    /**
     * @dev Redeem investment and profit
     * @param investmentId Investment ID
     * @return Profit amount
     */
    function redeem(uint256 investmentId) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        investmentExists(investmentId) 
        onlyInvestmentOwner(investmentId)
        notBlacklisted
        returns (uint256) 
    {
        Investment storage investment = _investments[investmentId];
        
        // Ensure investment is active
        require(
            investment.status == InvestmentStatus.Active,
            "InvestmentManager: investment is not active"
        );
        
        // Ensure investment has matured
        require(
            block.timestamp >= investment.endTime,
            "InvestmentManager: investment has not matured"
        );
        
        // Calculate profit
        uint256 profit = calculateProfit(investmentId);
        
        // Ensure asset-specific profit pool has enough balance
        require(
            _profitPool.getAssetBalance(investment.assetId) >= profit,
            "InvestmentManager: insufficient asset profit pool balance"
        );
        
        // Update investment status
        investment.status = InvestmentStatus.Completed;
        investment.profit = profit;
        investment.claimedProfit = profit;
        
        // Update asset balance
        _assetRegistry.updateAssetAmount(investment.assetId, investment.amount, true);
        
        // Transfer profit from asset-specific profit pool to user
        if (profit > 0) {
            _profitPool.withdrawProfitFromAsset(investment.assetId, profit, investment.investor);
        }
        
        // Return principal to user
        _weUSD.safeTransfer(investment.investor, investment.amount);
        
        emit ProfitClaimed(investmentId, investment.investor, profit);
        emit InvestmentStatusUpdated(investmentId, InvestmentStatus.Completed);
        
        return profit;
    }
    
    /**
     * @dev Emergency cancel investment, only callable by admin
     * @param investmentId Investment ID
     */
    function emergencyCancel(uint256 investmentId) 
        external 
        override 
        nonReentrant 
        onlyAdmin 
        investmentExists(investmentId) 
    {
        Investment storage investment = _investments[investmentId];
        
        // Ensure investment is active
        require(
            investment.status == InvestmentStatus.Active,
            "InvestmentManager: investment is not active"
        );
        
        // Update investment status
        investment.status = InvestmentStatus.Cancelled;
        
        // Update asset balance
        _assetRegistry.updateAssetAmount(investment.assetId, investment.amount, true);
        
        // Return principal to user
        _weUSD.safeTransfer(investment.investor, investment.amount);
        
        emit InvestmentStatusUpdated(investmentId, InvestmentStatus.Cancelled);
    }
    
    /**
     * @dev Add user to blacklist
     * @param account User address
     */
    function addToBlacklist(address account) 
        external 
        override 
        onlyAdmin 
    {
        require(!_blacklist[account], "InvestmentManager: account already blacklisted");
        _blacklist[account] = true;
        emit BlacklistUpdated(account, true);
    }
    
    /**
     * @dev Remove user from blacklist
     * @param account User address
     */
    function removeFromBlacklist(address account) 
        external 
        override 
        onlyAdmin 
    {
        require(_blacklist[account], "InvestmentManager: account not blacklisted");
        _blacklist[account] = false;
        emit BlacklistUpdated(account, false);
    }
    
    /**
     * @dev Check if user is blacklisted
     * @param account User address
     * @return Whether user is blacklisted
     */
    function isBlacklisted(address account) 
        external 
        view 
        override 
        returns (bool) 
    {
        return _blacklist[account];
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
     * @dev Get investment information
     * @param investmentId Investment ID
     * @return Investment information
     */
    function getInvestment(uint256 investmentId) 
        external 
        view 
        override 
        investmentExists(investmentId) 
        returns (Investment memory) 
    {
        return _investments[investmentId];
    }
    
    /**
     * @dev Get all investment IDs for a user
     * @param account User address
     * @return Investment ID array
     */
    function getUserInvestments(address account) 
        external 
        view 
        override 
        returns (uint256[] memory) 
    {
        return _userInvestments[account];
    }
    
    /**
     * @dev Get user investment summary
     * @param account User address
     * @return Investment summary
     */
    function getUserInvestmentSummary(address account) 
        external 
        view 
        override 
        returns (UserInvestmentSummary memory) 
    {
        uint256[] memory investmentIds = _userInvestments[account];
        uint256 totalInvestment = 0;
        uint256 totalActiveInvestment = 0;
        uint256 totalProfit = 0;
        uint256 totalClaimedProfit = 0;
        uint256 activeInvestmentCount = 0;
        
        for (uint256 i = 0; i < investmentIds.length; i++) {
            Investment storage investment = _investments[investmentIds[i]];
            totalInvestment += investment.amount;
            
            if (investment.status == InvestmentStatus.Active) {
                totalActiveInvestment += investment.amount;
                activeInvestmentCount++;
                totalProfit += calculateProfit(investmentIds[i]);
            }
            
            totalClaimedProfit += investment.claimedProfit;
        }
        
        UserInvestmentSummary memory summary = UserInvestmentSummary({
            totalInvestment: totalInvestment,
            totalActiveInvestment: totalActiveInvestment,
            totalProfit: totalProfit,
            totalClaimedProfit: totalClaimedProfit,
            activeInvestmentCount: activeInvestmentCount,
            totalInvestmentCount: investmentIds.length
        });
        
        return summary;
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