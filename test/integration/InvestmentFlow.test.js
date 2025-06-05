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

  // Constants
  const INVESTMENT_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("INVESTMENT_MANAGER_ROLE"));

  // Preset parameters
  const initialFunds = ethers.parseEther("1000000"); // 1M weUSD
  const assetAmount = ethers.parseEther("1000000"); // 1M weUSD
  const investAmount = ethers.parseEther("100"); // 100 weUSD
  const profitAmount = ethers.parseEther("10000"); // 10K weUSD
  const PERIOD_1_DAY = 86400; // 1 day (seconds)

  beforeEach(async function () {
    [owner, issuer, investor] = await ethers.getSigners();

    // Deploy weUSD token
    const WeUSD = await ethers.getContractFactory("ERC20Mock");
    weUSD = await WeUSD.deploy("Wrapped eUSD", "weUSD", 18);
    await weUSD.waitForDeployment();

    // Mint tokens
    await weUSD.mint(owner.address, initialFunds);
    await weUSD.mint(investor.address, initialFunds);

    // Deploy system parameters contract
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    systemParameters = await upgrades.deployProxy(SystemParameters, [owner.address]);
    await systemParameters.waitForDeployment();

    // Deploy asset registry contract
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    assetRegistry = await upgrades.deployProxy(AssetRegistry, [owner.address, await systemParameters.getAddress()]);
    await assetRegistry.waitForDeployment();

    // Deploy profit pool contract
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    profitPool = await upgrades.deployProxy(ProfitPool, [owner.address, await systemParameters.getAddress(), await weUSD.getAddress()]);
    await profitPool.waitForDeployment();

    // Deploy investment manager contract
    const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
    investmentManager = await upgrades.deployProxy(InvestmentManager, [
      owner.address,
      await systemParameters.getAddress(),
      await assetRegistry.getAddress(),
      await profitPool.getAddress(),
      await weUSD.getAddress()
    ]);
    await investmentManager.waitForDeployment();

    // Grant investment manager role
    await assetRegistry.grantInvestmentManagerRole(await investmentManager.getAddress());
    await profitPool.grantInvestmentManagerRole(await investmentManager.getAddress());

    // Add user to whitelist
    await investmentManager.addToWhitelist(investor.address);

    // Add asset
    await assetRegistry.addAsset(
      "Test Asset",
      issuer.address,
      "Test Issuer",
      "Test Asset Description",
      assetAmount
    );

    // Approve token usage
    await weUSD.connect(investor).approve(await investmentManager.getAddress(), initialFunds);
    await weUSD.approve(await profitPool.getAddress(), initialFunds);
  });

  describe("Complete Investment Flow", function () {
    it("Should allow the entire investment flow from invest to claim profit", async function () {
      // 1. Investment
      await investmentManager.connect(investor).invest(1, investAmount, PERIOD_1_DAY);

      // Check if investment is successful
      const userInvestmentCount = await investmentManager.getUserInvestmentCount(investor.address);
      expect(userInvestmentCount).to.equal(1);

      const investmentIds = await investmentManager.getUserInvestmentIds(investor.address, 0, 1);
      const investmentId = investmentIds[0];
      const investment = await investmentManager.getInvestment(investmentId);
      
      expect(investment.investor).to.equal(investor.address);
      expect(investment.amount).to.equal(investAmount);
      expect(investment.status).to.equal(0); // Active

      // 2. Add profit to profit pool
      await profitPool.addProfit(profitAmount);
      const poolInfo = await profitPool.getPoolInfo();
      expect(poolInfo.totalAmount).to.equal(profitAmount);

      // 3. Wait for investment period to end
      await time.increase(PERIOD_1_DAY + 1);

      // 4. Claim profit
      await investmentManager.connect(investor).updateInvestmentStatus(investmentId);
      const updatedInvestment = await investmentManager.getInvestment(investmentId);
      expect(updatedInvestment.status).to.equal(1); // Expired

      // Calculate expected profit
      const expectedProfit = await investmentManager.calculateProfit(investmentId);
      expect(expectedProfit).to.be.gt(0);

      // Claim profit
      const initialBalance = await weUSD.balanceOf(investor.address);
      await investmentManager.connect(investor).claimProfit(investmentId);
      const finalBalance = await weUSD.balanceOf(investor.address);

      // Check if profit is correct
      expect(finalBalance - initialBalance).to.equal(expectedProfit.add(investAmount));

      // Check investment status
      const finalInvestment = await investmentManager.getInvestment(investmentId);
      expect(finalInvestment.status).to.equal(2); // Claimed
      expect(finalInvestment.profit).to.equal(expectedProfit);
      expect(finalInvestment.claimedProfit).to.equal(expectedProfit);

      // 5. Check user investment overview
      const summary = await investmentManager.getUserInvestmentSummary(investor.address);
      expect(summary.totalInvested).to.equal(investAmount);
      expect(summary.activeInvestments).to.equal(0);
      expect(summary.totalProfit).to.equal(expectedProfit);
      expect(summary.pendingProfit).to.equal(0);
    });
  });
}); 