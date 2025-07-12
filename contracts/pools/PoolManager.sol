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
 * @dev 合并的投资和赎回资金池合约。内部管理两个池子余额，只需加减状态，无需转移代币。
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

    // 角色定义
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // 用于 InvestmentManager

    // 平台代币地址 (weUSD)
    address public weUSD;

    // 投资池余额：支持多个代币
    mapping(address => uint256) public investmentBalances;

    // 赎回池余额：只支持 weUSD
    uint256 public redemptionBalance;

    // 事件定义
    event FundsDepositedToInvestment(address indexed token, uint256 amount, address indexed from);
    event FundsWithdrawnFromInvestment(address indexed token, uint256 amount, address indexed to);
    event FundsDepositedToRedemption(uint256 amount, address indexed from);
    event FundsWithdrawnFromRedemption(uint256 amount, address indexed to);
    event FundsTransferredToRedemption(uint256 amount);
    event FundsTransferredToInvestment(uint256 amount);
    event BalanceUpdated(string pool, address indexed token, uint256 newBalance);

    /**
     * @dev 初始化函数
     * @param admin 管理员地址
     * @param _weUSD weUSD 地址
     * @param operator InvestmentManager 地址
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

    // investmentManager 角色
    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "PoolManager: caller is not an operator");
        _;
    }

    // 投资池：只允许 InvestmentManager 存入且只允许 weUSD
    function depositToInvestment(uint256 amount) external onlyOperator nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(weUSD).safeTransferFrom(msg.sender, address(this), amount);
        investmentBalances[weUSD] += amount;
        emit FundsDepositedToInvestment(weUSD, amount, msg.sender);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
    }

    // 投资池：管理员存入多种 RWA 等代币 (实际转移任意代币)
    function adminDepositToInvestment(address token, uint256 amount) external onlyAdmin nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        investmentBalances[token] += amount;
        emit FundsDepositedToInvestment(token, amount, msg.sender);
        emit BalanceUpdated("investment", token, investmentBalances[token]);
    }

    // 投资池：管理员取出任意代币 (实际转移任意代币)
    function adminWithdrawFromInvestment(address token, uint256 amount, address to) external onlyAdmin nonReentrant {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(investmentBalances[token] >= amount, "PoolManager: insufficient investment balance");
        investmentBalances[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit FundsWithdrawnFromInvestment(token, amount, to);
        emit BalanceUpdated("investment", token, investmentBalances[token]);
    }

    // 赎回池：任何人都可以存入weUSD (实际转移weUSD)
    function depositToRedemption(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        IERC20(weUSD).safeTransferFrom(msg.sender, address(this), amount);
        redemptionBalance += amount;
        emit FundsDepositedToRedemption(amount, msg.sender);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // 赎回池：InvestmentManager 取出给用户 (实际转移weUSD)
    function withdrawFromRedemption(uint256 amount, address to) external onlyOperator nonReentrant {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(redemptionBalance >= amount, "PoolManager: insufficient redemption balance");
        redemptionBalance -= amount;
        IERC20(weUSD).safeTransfer(to, amount);
        emit FundsWithdrawnFromRedemption(amount, to);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // 管理员内部转移：从投资池 weUSD 到赎回池 (只更新状态，无转移)
    function adminTransferToRedemption(uint256 amount) external onlyAdmin {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(investmentBalances[weUSD] >= amount, "PoolManager: insufficient investment weUSD balance");
        investmentBalances[weUSD] -= amount;
        redemptionBalance += amount;
        emit FundsTransferredToRedemption(amount);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // 管理员内部转移：从赎回池 weUSD 到投资池 (只更新状态，无转移)
    function adminTransferToInvestment(uint256 amount) external onlyAdmin {
        require(amount > 0, "PoolManager: amount must be greater than 0");
        require(redemptionBalance >= amount, "PoolManager: insufficient redemption weUSD balance");
        redemptionBalance -= amount;
        investmentBalances[weUSD] += amount;
        emit FundsTransferredToInvestment(amount);
        emit BalanceUpdated("investment", weUSD, investmentBalances[weUSD]);
        emit BalanceUpdated("redemption", weUSD, redemptionBalance);
    }

    // 查询函数
    function getInvestmentBalance(address token) external view returns (uint256) {
        return investmentBalances[token];
    }

    //批量查询投资池余额
    function getInvestmentBalances(address[] memory tokens) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = investmentBalances[tokens[i]];
        }
        return balances;
    }

    // 查询赎回池余额
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