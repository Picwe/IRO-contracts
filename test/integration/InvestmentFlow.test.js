const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Investment Flow Integration Test", function () {
  let systemParameters;
  let assetRegistry;
  let profitPool;
  let investmentManager;
  let weUSD;

  let owner;
  let issuer;
  let investor;

  // 常量
  const INVESTMENT_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INVESTMENT_MANAGER_ROLE"));

  // 预设参数
  const initialFunds = ethers.parseEther("1000000"); // 100万 weUSD
  const assetAmount = ethers.parseEther("1000000"); // 100万 weUSD
  const investAmount = ethers.parseEther("100"); // 100 weUSD
  const profitAmount = ethers.parseEther("10000"); // 1万 weUSD
  const PERIOD_1_DAY = 86400; // 1天（秒）

  beforeEach(async function () {
    [owner, issuer, investor] = await ethers.getSigners();

    // 部署 weUSD 代币
    const WeUSD = await ethers.getContractFactory("ERC20Mock");
    weUSD = await WeUSD.deploy("Wrapped eUSD", "weUSD", 18);
    await weUSD.waitForDeployment();

    // 铸造代币
    await weUSD.mint(owner.address, initialFunds);
    await weUSD.mint(investor.address, initialFunds);

    // 部署系统参数合约
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    systemParameters = await upgrades.deployProxy(SystemParameters, [owner.address]);
    await systemParameters.waitForDeployment();

    // 部署资产注册合约
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    assetRegistry = await upgrades.deployProxy(AssetRegistry, [owner.address, await systemParameters.getAddress()]);
    await assetRegistry.waitForDeployment();

    // 部署收益池合约
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    profitPool = await upgrades.deployProxy(ProfitPool, [owner.address, await systemParameters.getAddress(), await weUSD.getAddress()]);
    await profitPool.waitForDeployment();

    // 部署投资管理合约
    const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
    investmentManager = await upgrades.deployProxy(InvestmentManager, [
      owner.address,
      await systemParameters.getAddress(),
      await assetRegistry.getAddress(),
      await profitPool.getAddress(),
      await weUSD.getAddress()
    ]);
    await investmentManager.waitForDeployment();

    // 授予投资管理合约角色
    await assetRegistry.grantInvestmentManagerRole(await investmentManager.getAddress());
    await profitPool.grantInvestmentManagerRole(await investmentManager.getAddress());

    // 添加用户到白名单
    await investmentManager.addToWhitelist(investor.address);

    // 添加资产
    await assetRegistry.addAsset(
      "Test Asset",
      issuer.address,
      "Test Issuer",
      "Test Asset Description",
      assetAmount
    );

    // 批准代币使用
    await weUSD.connect(investor).approve(await investmentManager.getAddress(), initialFunds);
    await weUSD.approve(await profitPool.getAddress(), initialFunds);
  });

  describe("Complete Investment Flow", function () {
    it("Should allow the entire investment flow from invest to claim profit", async function () {
      // 1. 投资
      await investmentManager.connect(investor).invest(1, investAmount, PERIOD_1_DAY);

      // 检查投资是否成功
      const userInvestmentCount = await investmentManager.getUserInvestmentCount(investor.address);
      expect(userInvestmentCount).to.equal(1);

      const investmentIds = await investmentManager.getUserInvestmentIds(investor.address, 0, 1);
      const investmentId = investmentIds[0];
      const investment = await investmentManager.getInvestment(investmentId);
      
      expect(investment.investor).to.equal(investor.address);
      expect(investment.amount).to.equal(investAmount);
      expect(investment.status).to.equal(0); // Active

      // 2. 向收益池添加收益
      await profitPool.addProfit(profitAmount);
      const poolInfo = await profitPool.getPoolInfo();
      expect(poolInfo.totalAmount).to.equal(profitAmount);

      // 3. 等待投资期结束
      await time.increase(PERIOD_1_DAY + 1);

      // 4. 领取收益
      await investmentManager.connect(investor).updateInvestmentStatus(investmentId);
      const updatedInvestment = await investmentManager.getInvestment(investmentId);
      expect(updatedInvestment.status).to.equal(1); // Expired

      // 计算预期收益
      const expectedProfit = await investmentManager.calculateProfit(investmentId);
      expect(expectedProfit).to.be.gt(0);

      // 领取收益
      const initialBalance = await weUSD.balanceOf(investor.address);
      await investmentManager.connect(investor).claimProfit(investmentId);
      const finalBalance = await weUSD.balanceOf(investor.address);

      // 检查收益是否正确
      expect(finalBalance - initialBalance).to.equal(expectedProfit.add(investAmount));

      // 检查投资状态
      const finalInvestment = await investmentManager.getInvestment(investmentId);
      expect(finalInvestment.status).to.equal(2); // Claimed
      expect(finalInvestment.profit).to.equal(expectedProfit);
      expect(finalInvestment.claimedProfit).to.equal(expectedProfit);

      // 5. 检查用户投资概览
      const summary = await investmentManager.getUserInvestmentSummary(investor.address);
      expect(summary.totalInvested).to.equal(investAmount);
      expect(summary.activeInvestments).to.equal(0);
      expect(summary.totalProfit).to.equal(expectedProfit);
      expect(summary.pendingProfit).to.equal(0);
    });
  });
}); 