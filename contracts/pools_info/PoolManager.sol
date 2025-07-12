// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PoolManager
 * @dev Combined investment and redemption pool contract. Internally manages two pool balances, only updating state without actual token transfers for internal moves.
 */
contract PoolManager is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // For InvestmentManager

    // Platform token address (weUSD)
    address public weUSD;

    // Investment pool balances: supports multiple tokens
    mapping(address => uint256) public investmentBalances;

    // Redemption pool balance: only supports weUSD
    uint256 public redemptionBalance;

    // Event definitions
    event FundsDepositedToInvestment(address indexed token, uint256 amount, address indexed from);
    event FundsWithdrawnFromInvestment(address indexed token, uint256 amount, address indexed to);
    event FundsDepositedToRedemption(uint256 amount, address indexed from);
    event FundsWithdrawnFromRedemption(uint256 amount, address indexed to);
    event FundsTransferredToRedemption(uint256 amount);
    event FundsTransferredToInvestment(uint256 amount);
    event BalanceUpdated(string pool, address indexed token, uint256 newBalance);

    /**
     * @dev Initialization function
     * @param admin Admin address
     * @param _weUSD weUSD address
     * @param operator InvestmentManager address
     */
    function initialize(address admin, address _weUSD, address operator) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);

        weUSD = _weUSD;
    }

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "PoolManager: caller is not an admin");
        _;
    }

    // Only InvestmentManager role
    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "PoolManager: caller is not an operator");
        _;
    }

    // Investment pool: only allows InvestmentManager to deposit and only weUSD
    function depositToInvestment(uint256 amount) external onlyOperator nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(weUSD).safeTransferFrom(msg.sender, address(this), amount);
        investmentBalances[weUSD] += amount;
        emit FundsDepositedToInvestment(weUSD, amount, msg.sender);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
    }

    // Investment pool: admin deposits various RWA or other tokens (actual transfer of any token)
    function adminDepositToInvestment(address token, uint256 amount) external onlyAdmin nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        investmentBalances[token] += amount;
        emit FundsDepositedToInvestment(token, amount, msg.sender);
        emit BalanceUpdated("investment", token, investmentBalances[token]);
    }

    // Investment pool: admin withdraws any token (actual transfer of any token)
    function adminWithdrawFromInvestment(address token, uint256 amount, address to) external onlyAdmin nonReentrant {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(investmentBalances[token] >= amount, "PoolManager: insufficient investment balance");
        investmentBalances[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit FundsWithdrawnFromInvestment(token, amount, to);
        emit BalanceUpdated("investment", token, investmentBalances[token]);
    }

    // Redemption pool: anyone can deposit weUSD (actual transfer of weUSD)
    function depositToRedemption(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(weUSD).safeTransferFrom(msg.sender, address(this), amount);
        redemptionBalance += amount;
        emit FundsDepositedToRedemption(amount, msg.sender);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // Redemption pool: InvestmentManager withdraws for users (actual transfer of weUSD)
    function withdrawFromRedemption(uint256 amount, address to) external onlyOperator nonReentrant {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(redemptionBalance >= amount, "PoolManager: insufficient redemption balance");
        redemptionBalance -= amount;
        IERC20(weUSD).safeTransfer(to, amount);
        emit FundsWithdrawnFromRedemption(amount, to);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // Admin internal transfer: from investment pool (weUSD) to redemption pool (only updates state, no transfer)
    function adminTransferToRedemption(uint256 amount) external onlyAdmin {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(investmentBalances[weUSD] >= amount, "PoolManager: insufficient investment weUSD balance");
        investmentBalances[weUSD] -= amount;
        redemptionBalance += amount;
        emit FundsTransferredToRedemption(amount);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // Admin internal transfer: from redemption pool (weUSD) to investment pool (only updates state, no transfer)
    function adminTransferToInvestment(uint256 amount) external onlyAdmin {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(redemptionBalance >= amount, "PoolManager: insufficient redemption weUSD balance");
        redemptionBalance -= amount;
        investmentBalances[weUSD] += amount;
        emit FundsTransferredToInvestment(amount);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // Query function: get investment pool balance for a token
    function getInvestmentBalance(address token) external view returns (uint256) {
        return investmentBalances[token];
    }

    // Batch query investment pool balances
    function getInvestmentBalances(address[] memory tokens) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = investmentBalances[tokens[i]];
        }
        return balances;
    }

    // Query redemption pool balance
    function getRedemptionBalance() external view returns (uint256) {
        return redemptionBalance;
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
} 