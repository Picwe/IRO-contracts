const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("InvestmentManager", function () {
  let weUSD;
  let systemParameters;
  let assetRegistry;
  let profitPool;
  let investmentManager;
  let riskMonitor;
  let owner;
  let investor1;
  let investor2;
  
  const oneDay = 24 * 60 * 60; // 1 day
  const oneWeek = 7 * oneDay;  // 1 week
  
  beforeEach(async function () {
    [owner, investor1, investor2] = await ethers.getSigners();
    
    // Deploy mock weUSD token
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
    
    // Deploy system parameters contract
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    systemParameters = await upgrades.deployProxy(SystemParameters, [owner.address], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // Set system parameters
    await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
    await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
    await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // Minimum investment 10 weUSD
    await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // Maximum investment 100M weUSD
    await systemParameters.setInvestmentCooldown(0); // No cooldown for testing
    await systemParameters.setProfitPoolMinBalance(ethers.parseEther("100")); // Minimum balance 100 weUSD
    
    // Deploy asset registry contract
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    assetRegistry = await upgrades.deployProxy(AssetRegistry, [owner.address], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // Add test asset
    await assetRegistry.addAsset(
      "Test Bond", 
      "Test Bond", 
      "This is a test bond asset", 
      "Test Inc.",
      ethers.parseEther("1000000"), // 1M weUSD
      "https://example.com/image.png"
    );
    
    // Deploy profit pool contract
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    profitPool = await upgrades.deployProxy(ProfitPool, [
      owner.address,
      await systemParameters.getAddress(),
      await weUSD.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // Deploy investment manager contract
    const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
    investmentManager = await upgrades.deployProxy(InvestmentManager, [
      owner.address,
      await systemParameters.getAddress(),
      await assetRegistry.getAddress(),
      await profitPool.getAddress(),
      await weUSD.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // Deploy risk monitor contract
    const RiskMonitor = await ethers.getContractFactory("RiskMonitor");
    riskMonitor = await upgrades.deployProxy(RiskMonitor, [
      owner.address,
      await systemParameters.getAddress(),
      await profitPool.getAddress(),
      await investmentManager.getAddress(),
      await weUSD.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // Set permissions
    await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
    await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
    
    // Add funds to profit pool
    await weUSD.mint(owner.address, ethers.parseEther("10000"));
    await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
    await profitPool.depositProfit(ethers.parseEther("10000"));
    
    // Mint tokens for investors
    await weUSD.mint(investor1.address, ethers.parseEther("1000"));
    await weUSD.mint(investor2.address, ethers.parseEther("1000"));
    
    // Add investors to whitelist
    await investmentManager.addToWhitelist(investor1.address);
    await investmentManager.addToWhitelist(investor2.address);
  });
  
  describe("Basic Functionality Tests", function () {
    it("should initialize contract correctly", async function () {
      expect(await investmentManager.isWhitelisted(owner.address)).to.be.true;
      expect(await investmentManager.isWhitelisted(investor1.address)).to.be.true;
      expect(await investmentManager.isWhitelisted(investor2.address)).to.be.true;
      
      expect(await systemParameters.getPeriodAPY(oneDay)).to.equal(ethers.parseEther("0.05"));
      expect(await systemParameters.getPeriodAPY(oneWeek)).to.equal(ethers.parseEther("0.10"));
    });
    
    it("user should be able to invest", async function () {
      // Investor 1 approves tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 makes investment
      const tx = await investmentManager.connect(investor1).invest(
        1, // Asset ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1 day period
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Find investment ID from event
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      expect(event).to.not.be.undefined;
      
      // Get investment ID
      const investmentId = event.args[0];
      
      // Check investment record
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.investor).to.equal(investor1.address);
      expect(investment.amount).to.equal(ethers.parseEther("100"));
      expect(investment.period).to.equal(oneDay);
      expect(investment.status).to.equal(0); // Active
    });
    
    it("user should be able to redeem investment", async function () {
      // Investor 1 approves tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 makes investment
      const tx = await investmentManager.connect(investor1).invest(
        1, // Asset ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1 day period
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Find investment ID from event
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      const investmentId = event.args[0];
      
      // Get balance before redemption
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      
      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");
      
      // Redeem investment
      await investmentManager.connect(investor1).redeem(investmentId);
      
      // Get balance after redemption
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      
      // Check balance increase (principal + profit)
      expect(balanceAfter).to.be.gt(balanceBefore);
      
      // Check investment status
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(1); // Completed
    });
    
    it("risk monitor should correctly detect unusual investments", async function () {
      // Set unusual investment threshold to 50 weUSD
      await riskMonitor.setUnusualInvestmentAmountThreshold(ethers.parseEther("50"));
      
      // Monitor normal investment
      const normalResult = await riskMonitor.monitorInvestment(
        investor1.address,
        ethers.parseEther("40")
      );
      expect(normalResult).to.be.false;
      
      // Monitor unusual investment
      const unusualResult = await riskMonitor.monitorInvestment(
        investor1.address,
        ethers.parseEther("60")
      );
      expect(unusualResult).to.be.true;
    });
  });
  
  describe("Security Mechanism Tests", function () {
    it("should handle blacklist correctly", async function () {
      // Investor 1 approves tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 makes investment
      await investmentManager.connect(investor1).invest(
        1, // Asset ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1 day period
      );
      
      // Add investor 1 to blacklist
      await investmentManager.addToBlacklist(investor1.address);
      expect(await investmentManager.isBlacklisted(investor1.address)).to.be.true;
      
      // Investor 1 approves more tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 tries to invest again, should fail
      await expect(
        investmentManager.connect(investor1).invest(
          1, // Asset ID
          ethers.parseEther("100"), // 100 weUSD
          oneDay // 1 day period
        )
      ).to.be.revertedWith("User is blacklisted");
    });
    
    it("should handle emergency cancel correctly", async function () {
      // Investor 1 approves tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 makes investment
      const tx = await investmentManager.connect(investor1).invest(
        1, // Asset ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1 day period
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Find investment ID from event
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      const investmentId = event.args[0];
      
      // Get balance before emergency cancel
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      
      // Emergency cancel investment
      await investmentManager.emergencyCancel(investmentId);
      
      // Get balance after emergency cancel
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      
      // Check balance increase (only principal, no profit)
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("100"));
      
      // Check investment status
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(2); // Cancelled
    });
    
    it("should handle pause mechanism correctly", async function () {
      // Pause contract
      await investmentManager.pause();
      
      // Investor 1 approves tokens
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // Investor 1 tries to invest, should fail
      await expect(
        investmentManager.connect(investor1).invest(
          1, // Asset ID
          ethers.parseEther("100"), // 100 weUSD
          oneDay // 1 day period
        )
      ).to.be.revertedWith("Pausable: paused");
      
      // Unpause contract
      await investmentManager.unpause();
      
      // Investor 1 should be able to invest
      await investmentManager.connect(investor1).invest(
        1, // Asset ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1 day period
      );
    });
  });
}); 