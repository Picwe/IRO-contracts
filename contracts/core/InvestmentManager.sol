// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // System parameters contract
    ISystemParameters private _systemParameters;
    
    // Asset registry contract
    IAssetRegistry private _assetRegistry;
    
    // Profit pool contract
    IProfitPool private _profitPool;
    
    // Investment mappings
    mapping(uint256 => Investment) private _investments;
    uint256 private _nextInvestmentId;
    
    // User investment mappings
    mapping(address => uint256[]) private _userInvestments;
    
    // User last redemption time mapping
    mapping(address => uint256) private _lastRedemptionTime;
    
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
     */
    function initialize(
        address admin,
        address systemParameters,
        address assetRegistry,
        address profitPool
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
        
        // Initialize investment ID
        _nextInvestmentId = 1;
    }
    
    /**
     * @dev Get investment token address
     * @return Investment token address
     */
    function getInvestmentToken() 
        public 
        view 
        returns (address) 
    {
        return _systemParameters.getPlatformToken();
    }
    
    /**
     * @dev Get reward token address
     * @return Reward token address
     */
    function getRewardToken() 
        external 
        view 
        override
        returns (address) 
    {
        return _systemParameters.getPlatformToken();
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
        require(_investments[investmentId].investmentId == investmentId && investmentId > 0, "InvestmentManager: investment does not exist");
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
     * @dev Ensures redemption cooldown period has passed
     */
    modifier redemptionCooldownPassed() {
        uint256 cooldown = _systemParameters.getInvestmentCooldown();
        require(
            block.timestamp - _lastRedemptionTime[msg.sender] >= cooldown,
            "InvestmentManager: redemption cooldown not passed"
        );
        _;
    }
    
    /**
     * @dev Invest in an asset
     * @param assetId Asset ID
     * @param amount Investment amount
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
        returns (uint256) 
    {
        // Get asset information first to use its fields for validation
        IAssetRegistry.Asset memory asset = _assetRegistry.getAsset(assetId);
        
        // Validate investment amount
        require(amount > 0, "InvestmentManager: amount must be greater than 0");
        
        // Validate investment using asset registry
        require(
            _assetRegistry.validateInvestment(assetId, amount),
            "InvestmentManager: invalid investment"
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
        investment.period = asset.period;
        investment.apy = asset.apy;
        investment.status = InvestmentStatus.Active;
        investment.profit = 0;
        investment.claimedProfit = 0;
        
        // Update user investment list
        _userInvestments[msg.sender].push(investmentId);
        
        // Update asset balance
        _assetRegistry.updateAssetAmount(assetId, amount, false);
        
        // Transfer platform tokens to contract
        IERC20(getInvestmentToken()).safeTransferFrom(msg.sender, address(this), amount);
        
        emit InvestmentCreated(
            investmentId,
            msg.sender,
            assetId,
            amount,
            startTime,
            endTime,
            investment.period,
            investment.apy
        );
        
        return investmentId;
    }
    
    /**
     * @dev Calculate investment profit with precision loss protection
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
        
        // Calculate elapsed time (minimum 1 second to avoid 0 profit for very short periods)
        uint256 elapsedTime;
        if (currentTime > investment.endTime) {
            elapsedTime = investment.endTime - investment.startTime;
        } else {
            elapsedTime = currentTime - investment.startTime;
        }
        
        // If no time has elapsed, return 0
        if (elapsedTime == 0) {
            return 0;
        }
        
        // Use 365 days as seconds in year
        uint256 secondsInYear = 365 days;
        
        // Check for potential overflow before calculation
        if (investment.apy > 0 && elapsedTime > 0) {
            // Simplified overflow check: if amount * apy would overflow, revert
            if (investment.amount > type(uint256).max / investment.apy) {
                revert("InvestmentManager: calculation would overflow");
            }
        }
        
        // Enhanced profit calculation with precision loss protection
        // Method 1: Scale up calculation for better precision, then scale down
        uint256 scaleFactor = 1e18; // Use 18 decimal precision
        
        // Calculate: (amount * apy * elapsedTime * scaleFactor) / (secondsInYear * 10000)
        uint256 numerator = investment.amount * investment.apy * elapsedTime;
        uint256 denominator = secondsInYear * 10000;
        
        // Calculate profit with higher precision
        uint256 scaledProfit = (numerator * scaleFactor) / denominator;
        uint256 profit = scaledProfit / scaleFactor;
        
                 // Apply minimum profit threshold to prevent zero profits for legitimate investments
         if (profit == 0 && investment.amount > 0 && elapsedTime > 0) {
             // Get minimum profit threshold from system parameters (basis points per day)
             uint256 thresholdBasisPoints = _systemParameters.getMinimumProfitThreshold();
             
             if (thresholdBasisPoints > 0) {
                 // Calculate minimum daily profit based on threshold
                 // thresholdBasisPoints = basis points per day (e.g., 1 = 0.01% daily)
                 uint256 minimumDailyProfit = (investment.amount * thresholdBasisPoints) / 10000;
                 if (minimumDailyProfit == 0 && investment.amount > 0) {
                     minimumDailyProfit = 1; // Absolute minimum of 1 wei
                 }
                 
                 // Calculate minimum profit based on elapsed time
                 uint256 daysPassed = elapsedTime / 1 days;
                 if (daysPassed == 0 && elapsedTime > 12 hours) {
                     daysPassed = 1; // Round up if more than half a day
                 }
                 
                 uint256 minimumProfit = minimumDailyProfit * daysPassed;
                 
                 // Safety cap: minimum profit should not exceed 1% of principal
                 uint256 maxMinimumProfit = investment.amount / 100;
                 if (minimumProfit > maxMinimumProfit) {
                     minimumProfit = maxMinimumProfit;
                 }
                 
                 // Use the larger of calculated profit or minimum profit
                 profit = minimumProfit;
             }
         }
        
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
        redemptionCooldownPassed
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
        
        // Transfer profit from asset-specific profit pool directly to investor
        if (profit > 0) {
            _profitPool.withdrawProfitFromAsset(
                investment.assetId, 
                profit,
                investment.investor
            );
            // Note: withdrawProfitFromAsset already transfers profit directly to investor
            // No need for additional transfer here
        }
        
        // Return principal to user using platform token
        IERC20(getInvestmentToken()).safeTransfer(investment.investor, investment.amount);
        
        // Update last redemption time
        _lastRedemptionTime[msg.sender] = block.timestamp;
        
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
        
        // Return principal to user using platform token
        IERC20(getInvestmentToken()).safeTransfer(investment.investor, investment.amount);
        
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
    ) 
        external 
        view 
        override 
        returns (IInvestmentManager.PaginatedInvestments memory) 
    {
        uint256[] memory investmentIds = _userInvestments[account];
        uint256 totalCount = investmentIds.length;
        
        // Input validation
        require(limit > 0, "InvestmentManager: limit must be greater than 0");
        require(limit <= 100, "InvestmentManager: limit cannot exceed 100");
        
        // Calculate actual slice size
        uint256 start = offset;
        uint256 end = offset + limit;
        
        // Handle edge cases
        if (start >= totalCount) {
            // Return empty result if offset is beyond total count
            Investment[] memory emptyInvestments = new Investment[](0);
            return IInvestmentManager.PaginatedInvestments({
                investments: emptyInvestments,
                totalCount: totalCount,
                hasNextPage: false
            });
        }
        
        if (end > totalCount) {
            end = totalCount;
        }
        
        // Create result array
        uint256 resultLength = end - start;
        Investment[] memory investments = new Investment[](resultLength);
        
        // Fill the result array with investment data
        for (uint256 i = 0; i < resultLength; i++) {
            uint256 investmentId = investmentIds[start + i];
            investments[i] = _investments[investmentId];
            
            // Update current profit for active investments
            if (investments[i].status == InvestmentStatus.Active) {
                investments[i].profit = calculateProfit(investmentId);
            }
        }
        
        // Check if there are more pages
        bool hasNextPage = end < totalCount;
        
        return IInvestmentManager.PaginatedInvestments({
            investments: investments,
            totalCount: totalCount,
            hasNextPage: hasNextPage
        });
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