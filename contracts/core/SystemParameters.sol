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
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // Minimum investment amount
    uint256 private _minInvestmentAmount;
    
    // Maximum investment amount
    uint256 private _maxInvestmentAmount;
    
    // Investment cooldown (in seconds)
    uint256 private _investmentCooldown;
    
    // Profit pool minimum balance
    uint256 private _profitPoolMinBalance;
    
    // Profit withdrawal cooldown (in seconds)
    uint256 private _profitWithdrawalCooldown;
    
    // Platform weUSD token address
    address private _platformToken;
    
    // Period APY mapping (period => APY)
    mapping(uint256 => uint256) private _periodAPY;
    
    // Event definitions
    event MinInvestmentAmountUpdated(uint256 amount);
    event MaxInvestmentAmountUpdated(uint256 amount);
    event InvestmentCooldownUpdated(uint256 cooldown);
    event ProfitPoolMinBalanceUpdated(uint256 amount);
    event ProfitWithdrawalCooldownUpdated(uint256 cooldown);
    event PlatformTokenUpdated(address token);
    event PeriodAPYUpdated(uint256 period, uint256 apy);
    
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
        _minInvestmentAmount = 10 * 10**18; // 10 weUSD
        _maxInvestmentAmount = 100_000_000 * 10**18; // 100 million weUSD
        _investmentCooldown = 1 days; // 1 day
        _profitPoolMinBalance = 1000 * 10**18; // 1000 weUSD
        _profitWithdrawalCooldown = 1 days; // 1 day
    }
    
    /**
     * @dev Ensures caller has admin role
     */
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "SystemParameters: caller is not an admin");
        _;
    }
    
    /**
     * @dev Set minimum investment amount
     * @param amount Minimum investment amount
     */
    function setMinInvestmentAmount(uint256 amount) external override onlyAdmin {
        require(amount > 0, "SystemParameters: amount must be greater than 0");
        require(amount < _maxInvestmentAmount, "SystemParameters: amount must be less than max investment amount");
        _minInvestmentAmount = amount;
        emit MinInvestmentAmountUpdated(amount);
    }
    
    /**
     * @dev Get minimum investment amount
     * @return Minimum investment amount
     */
    function getMinInvestmentAmount() external view override returns (uint256) {
        return _minInvestmentAmount;
    }
    
    /**
     * @dev Set maximum investment amount
     * @param amount Maximum investment amount
     */
    function setMaxInvestmentAmount(uint256 amount) external override onlyAdmin {
        require(amount > _minInvestmentAmount, "SystemParameters: amount must be greater than min investment amount");
        _maxInvestmentAmount = amount;
        emit MaxInvestmentAmountUpdated(amount);
    }
    
    /**
     * @dev Get maximum investment amount
     * @return Maximum investment amount
     */
    function getMaxInvestmentAmount() external view override returns (uint256) {
        return _maxInvestmentAmount;
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
     * @dev Set APY for a period
     * @param period Period (in seconds)
     * @param apy Annual percentage yield (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     */
    function setPeriodAPY(uint256 period, uint256 apy) external override onlyAdmin {
        require(period > 0, "SystemParameters: period must be greater than 0");
        require(apy > 0, "SystemParameters: apy must be greater than 0");
        _periodAPY[period] = apy;
        emit PeriodAPYUpdated(period, apy);
    }
    
    /**
     * @dev Get APY for a period
     * @param period Period (in seconds)
     * @return Annual percentage yield (based on 10000: e.g., 1000 = 10%, 10000 = 100%)
     */
    function getPeriodAPY(uint256 period) external view override returns (uint256) {
        require(period > 0, "SystemParameters: period must be greater than 0");
        uint256 apy = _periodAPY[period];
        require(apy > 0, "SystemParameters: no APY set for this period");
        return apy;
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