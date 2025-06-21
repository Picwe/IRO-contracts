// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "../interfaces/ISystemParameters.sol";

/**
 * @title SystemParameters
 * @dev System parameters contract for managing system configuration parameters
 */
contract SystemParameters is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable,
    ISystemParameters 
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // Investment cooldown (in seconds)
    uint256 private _investmentCooldown;
    
    // Profit pool minimum balance
    uint256 private _profitPoolMinBalance;
    
    // Profit withdrawal cooldown (in seconds)
    uint256 private _profitWithdrawalCooldown;
    
    // Platform weUSD token address
    address private _platformToken;
    
    // Minimum profit threshold (basis points per day, e.g., 1 = 0.01% daily)
    uint256 private _minimumProfitThresholdBasisPoints;
    
    // Event definitions
    event InvestmentCooldownUpdated(uint256 cooldown);
    event ProfitPoolMinBalanceUpdated(uint256 amount);
    event ProfitWithdrawalCooldownUpdated(uint256 cooldown);
    event PlatformTokenUpdated(address token);
    event MinimumProfitThresholdUpdated(uint256 basisPoints);
    
    /**
     * @dev Initialization function, replaces constructor
     * @param admin Admin address
     * @param platformToken Platform weUSD token address
     */
    function initialize(address admin, address platformToken) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        require(platformToken != address(0), "SystemParameters: platformToken cannot be zero address");
        
        // Set roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        // Set platform token
        _platformToken = platformToken;
        
        // Set default parameters
        _investmentCooldown = 1 days; // 1 day
        _profitPoolMinBalance = 1000 * 10**18; // 1000 weUSD
        _profitWithdrawalCooldown = 1 days; // 1 day
        _minimumProfitThresholdBasisPoints = 1; // 0.01% daily minimum
    }
    
    /**
     * @dev Ensures caller has admin role
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "SystemParameters: caller is not an admin");
        _;
    }
    

    
    /**
     * @dev Set investment cooldown
     * @param cooldown Cooldown period (in seconds)
     */
    function setInvestmentCooldown(uint256 cooldown) external override onlyAdmin {
        _investmentCooldown = cooldown;
        emit InvestmentCooldownUpdated(cooldown);
    }
    
    /**
     * @dev Get investment cooldown
     * @return Cooldown period (in seconds)
     */
    function getInvestmentCooldown() external view override returns (uint256) {
        return _investmentCooldown;
    }
    
    /**
     * @dev Set profit pool minimum balance
     * @param amount Minimum balance
     */
    function setProfitPoolMinBalance(uint256 amount) external override onlyAdmin {
        _profitPoolMinBalance = amount;
        emit ProfitPoolMinBalanceUpdated(amount);
    }
    
    /**
     * @dev Get profit pool minimum balance
     * @return Minimum balance
     */
    function getProfitPoolMinBalance() external view override returns (uint256) {
        return _profitPoolMinBalance;
    }
    
    /**
     * @dev Set profit withdrawal cooldown
     * @param cooldown Cooldown period (in seconds)
     */
    function setProfitWithdrawalCooldown(uint256 cooldown) external override onlyAdmin {
        _profitWithdrawalCooldown = cooldown;
        emit ProfitWithdrawalCooldownUpdated(cooldown);
    }
    
    /**
     * @dev Get profit withdrawal cooldown
     * @return Cooldown period (in seconds)
     */
    function getProfitWithdrawalCooldown() external view override returns (uint256) {
        return _profitWithdrawalCooldown;
    }
    
    /**
     * @dev Set platform token address
     * @param token Platform token address
     */
    function setPlatformToken(address token) external override onlyAdmin {
        require(token != address(0), "SystemParameters: token cannot be zero address");
        _platformToken = token;
        emit PlatformTokenUpdated(token);
    }
    
    /**
     * @dev Get platform token address
     * @return Platform token address
     */
    function getPlatformToken() external view override returns (address) {
        return _platformToken;
    }
    
    /**
     * @dev Set minimum profit threshold in basis points per day
     * @param basisPoints Basis points per day (e.g., 1 = 0.01% daily)
     */
    function setMinimumProfitThreshold(uint256 basisPoints) external override onlyAdmin {
        require(basisPoints <= 1000, "SystemParameters: threshold too high"); // Max 10% daily
        _minimumProfitThresholdBasisPoints = basisPoints;
        emit MinimumProfitThresholdUpdated(basisPoints);
    }
    
    /**
     * @dev Get minimum profit threshold in basis points per day
     * @return Basis points per day (e.g., 1 = 0.01% daily)
     */
    function getMinimumProfitThreshold() external view override returns (uint256) {
        return _minimumProfitThresholdBasisPoints;
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

    /**
     * @dev Pause contract
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyAdmin {
        _unpause();
    }
} 