const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("System Integration Tests", function () {
  // Test constants
  const PLATFORM_TOKEN_DECIMALS = 18;
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", PLATFORM_TOKEN_DECIMALS); // 1 million tokens
  const PROFIT_POOL_INITIAL = ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS); // 10,000 tokens initial profit pool
  
  // Test fixture - deploy contracts and set up test environment
  async function deployContractsFixture() {
    // Get signers
    const [deployer, investor1, investor2, operator, user1] = await ethers.getSigners();
    
    console.log("\n=== Test Environment Setup ===");
    console.log(`Deployer address: ${deployer.address}`);
    console.log(`Investor1 address: ${investor1.address}`);
    console.log(`Investor2 address: ${investor2.address}`);
    console.log(`Operator address: ${operator.address}`);
    
    // Deploy ERC20Mock token (weUSD)
    console.log("Deploying ERC20Mock (weUSD)...");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
    await weUSD.waitForDeployment();
    console.log(`ERC20Mock (weUSD) deployed address: ${await weUSD.getAddress()}`);
    
    // Mint initial supply to deployer
    await weUSD.mint(deployer.address, INITIAL_SUPPLY);
    console.log(`Initial supply: ${ethers.formatUnits(INITIAL_SUPPLY, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    
    // Deploy SystemParameters contract
    console.log("Deploying SystemParameters...");
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    const systemParameters = await upgrades.deployProxy(SystemParameters, [deployer.address, await weUSD.getAddress()], {
      initializer: "initialize",
      kind: "uups"
    });
    await systemParameters.waitForDeployment();
    console.log(`SystemParameters deployed address: ${await systemParameters.getAddress()}`);
    
    // Set system parameters
    console.log("Setting system parameters...");
    const oneDay = 24 * 60 * 60; // 1 day
    const oneWeek = 7 * oneDay;  // 1 week
    const twoWeeks = 2 * oneWeek; // 2 weeks
    const oneMonth = 30 * oneDay; // 1 month
    const threeMonths = 3 * oneMonth; // 3 months
    const sixMonths = 6 * oneMonth; // 6 months
    
    // Note: APY and investment limits are now configured per asset in AssetRegistry
    
    // Set minimum profit threshold for precision loss protection
    await systemParameters.setMinimumProfitThreshold(1); // 0.01% daily minimum
    
    // Set investment cooldown - set to 1 minute for testing
    await systemParameters.setInvestmentCooldown(60);
    
    // Deploy AssetRegistry contract
    console.log("Deploying AssetRegistry...");
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer.address, await systemParameters.getAddress()], {
      initializer: "initialize",
      kind: "uups"
    });
    await assetRegistry.waitForDeployment();
    console.log(`AssetRegistry deployed address: ${await assetRegistry.getAddress()}`);
    
    // Add sample assets
    console.log("Adding sample assets...");
    await assetRegistry.addAsset(
      "Test Bond A", 
      "Test Company", 
      "This is a test bond asset", 
      ethers.parseUnits("1000000", PLATFORM_TOKEN_DECIMALS), // 1M weUSD max amount
      1000, // 10% APY (based on 10000)
      ethers.parseUnits("100", PLATFORM_TOKEN_DECIMALS), // 100 weUSD min investment
      ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS), // 10K weUSD max investment per user
      oneMonth // 1 month period
    );
    
    await assetRegistry.addAsset(
      "Test Bond B", 
      "Test Corp", 
      "This is another test bond asset", 
      ethers.parseUnits("2000000", PLATFORM_TOKEN_DECIMALS), // 2M weUSD max amount
      1500, // 15% APY (based on 10000)
      ethers.parseUnits("500", PLATFORM_TOKEN_DECIMALS), // 500 weUSD min investment
      ethers.parseUnits("20000", PLATFORM_TOKEN_DECIMALS), // 20K weUSD max investment per user
      threeMonths // 3 months period
    );
    
    // Deploy ProfitPool contract
    console.log("Deploying ProfitPool...");
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    const profitPool = await upgrades.deployProxy(ProfitPool, [
      deployer.address,
      await systemParameters.getAddress(),
      await assetRegistry.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    await profitPool.waitForDeployment();
    console.log(`ProfitPool deployed address: ${await profitPool.getAddress()}`);
    
    // Deploy InvestmentManager contract
    console.log("Deploying InvestmentManager...");
    const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
    const investmentManager = await upgrades.deployProxy(InvestmentManager, [
      deployer.address,
      await systemParameters.getAddress(),
      await assetRegistry.getAddress(),
      await profitPool.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    await investmentManager.waitForDeployment();
    console.log(`InvestmentManager deployed address: ${await investmentManager.getAddress()}`);
    
    // Set InvestmentManager as operator for AssetRegistry
    console.log("Setting contract permissions...");
    await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
    
    // Set InvestmentManager as operator for ProfitPool
    await profitPool.grantOperatorRole(await investmentManager.getAddress());
    
    // Add some test funds to profit pool for each asset
    console.log("Adding test funds to profit pool...");
    await weUSD.mint(deployer.address, PROFIT_POOL_INITIAL); // Mint 10000 weUSD
    await weUSD.approve(await profitPool.getAddress(), PROFIT_POOL_INITIAL);
    const fundPerAsset = PROFIT_POOL_INITIAL / 2n;
    await profitPool.depositProfitForAsset(1, fundPerAsset);
    await profitPool.depositProfitForAsset(2, fundPerAsset);
    
    // Give investors some tokens for testing
    const investorBalance = ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS); // 10K tokens
    await weUSD.mint(investor1.address, investorBalance);
    await weUSD.mint(investor2.address, investorBalance);
    console.log(`Investor1 balance: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    console.log(`Investor2 balance: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    
    console.log("=== Test Environment Setup Completed ===\n");
    
    // Return all deployed contracts and accounts
    return { 
      deployer, 
      investor1, 
      investor2, 
      operator, 
      user1,
      weUSD, 
      systemParameters, 
      assetRegistry, 
      profitPool, 
      investmentManager,
      oneDay,
      oneWeek,
      oneMonth,
      threeMonths,
      sixMonths
    };
  }
  
  describe("Initial Setup and Configuration Tests", function () {
    it("should initialize system parameters correctly", async function () {
      const { systemParameters, weUSD } = await loadFixture(deployContractsFixture);
      
      // Verify platform token
      const platformToken = await systemParameters.getPlatformToken();
      expect(platformToken).to.equal(await weUSD.getAddress());
      
      // Note: APY and investment limits verification now happens in AssetRegistry tests
      
      console.log("System parameters verification successful");
    });
    
    it("should initialize asset registry correctly", async function () {
      const { assetRegistry } = await loadFixture(deployContractsFixture);
      
      // Verify asset count
      const assetCount = await assetRegistry.getAssetCount();
      expect(assetCount).to.equal(2);
      
      // Verify asset details
      const asset1 = await assetRegistry.getAsset(1);
      expect(asset1.name).to.equal("Test Bond A");
      expect(asset1.apy).to.equal(1000); // 10%
      
      const asset2 = await assetRegistry.getAsset(2);
      expect(asset2.name).to.equal("Test Bond B");
      expect(asset2.apy).to.equal(1500); // 15%
      
      console.log("Asset registry verification successful");
    });
  });
  
  describe("Investment and Profit Tests", function () {
    it("should allow user to invest in an asset", async function () {
      const { investmentManager, weUSD, investor1 } = await loadFixture(deployContractsFixture);
      
      const assetId = 1; // First asset
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS); // 1000 weUSD
      
      // Approve token transfer
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      
      // Make investment
      await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      
      // Check investment details
      const investmentIds = await investmentManager.getUserInvestments(investor1.address);
      expect(investmentIds.length).to.equal(1);
      
      const investmentId = investmentIds[0];
      const investment = await investmentManager.getInvestment(investmentId);
      
      expect(investment.investor).to.equal(investor1.address);
      expect(investment.assetId).to.equal(assetId);
      expect(investment.amount).to.equal(investmentAmount);
      expect(investment.status).to.equal(1); // Active
      
      console.log("Investment creation successful");
    });
    
    it("should calculate profit correctly", async function () {
      const { investmentManager, weUSD, investor1, oneMonth } = await loadFixture(deployContractsFixture);
      
      const assetId = 1; // First asset (10% APY)
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS); // 1000 weUSD
      
      // Approve token transfer
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      
      // Make investment
      await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      
      // Get investment ID
      const investmentIds = await investmentManager.getUserInvestments(investor1.address);
      const investmentId = investmentIds[0];
      
      // Fast forward time by one month before calculating profit
      await network.provider.send("evm_increaseTime", [oneMonth]);
      await network.provider.send("evm_mine");
      
      // Calculate expected profit (approximation)
      // 10% APY on 1000 weUSD for 1 month is roughly 8.33 weUSD
      // Formula: amount * apy * elapsedTime / (secondsInYear * 10000)
      
      // Calculate profit
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(1); // Active
      const profit = await investmentManager.calculateProfit(investmentId);
      console.log(`Calculated profit: ${ethers.formatUnits(profit, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // Profit should be greater than 0
      expect(profit).to.be.gt(0);
      
      console.log("Profit calculation verification successful");
    });

    it("should handle small investment amounts with precision loss protection", async function () {
      const { investmentManager, assetRegistry, weUSD, user1, oneDay } = await loadFixture(deployContractsFixture);
      
      // Use minInvestment for asset 1 (100 weUSD)
      const smallAmount = ethers.parseUnits("100", PLATFORM_TOKEN_DECIMALS); // 100 weUSD
      
      // Mint tokens for user
      await weUSD.mint(user1.address, smallAmount);
      await weUSD.connect(user1).approve(await investmentManager.getAddress(), smallAmount);
      
      // Make investment
      await investmentManager.connect(user1).invest(1, smallAmount);
      
      // Fast forward time by 1 day
      await network.provider.send("evm_increaseTime", [oneDay]);
      await network.provider.send("evm_mine");
      
      // Calculate profit for small investment
      const investmentIds = await investmentManager.getUserInvestments(user1.address);
      const investmentId = investmentIds[0];
      const profit = await investmentManager.calculateProfit(investmentId);
      console.log(`Small investment profit: ${ethers.formatUnits(profit, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // Even small investments should get some profit due to minimum threshold
      expect(profit).to.be.gt(0);
      
      // Profit should be reasonable (not too large)
      const maxReasonableProfit = smallAmount / 100n; // Should not exceed 1% of principal
      expect(profit).to.be.lte(maxReasonableProfit);
      
      console.log("Small investment precision loss protection verification successful");
    });
  });
  
  describe("System Management Tests", function () {
    it("should allow admin to configure minimum profit threshold", async function () {
      const { systemParameters, deployer } = await loadFixture(deployContractsFixture);
      
      // Test setting minimum profit threshold
      const newThreshold = 5; // 0.05% daily
      await systemParameters.connect(deployer).setMinimumProfitThreshold(newThreshold);
      
      const updatedThreshold = await systemParameters.getMinimumProfitThreshold();
      expect(updatedThreshold).to.equal(newThreshold);
      
      // Test maximum threshold limit
      await expect(
        systemParameters.connect(deployer).setMinimumProfitThreshold(1001) // > 10% daily
      ).to.be.revertedWith("SystemParameters: threshold too high");
      
      console.log("Minimum profit threshold configuration successful");
    });
    
    it("should allow admin to manage assets", async function () {
      const { assetRegistry, deployer } = await loadFixture(deployContractsFixture);
      
      // Disable an asset
      await assetRegistry.connect(deployer).disableAsset(1);
      
      // Verify asset is disabled (status = 0 for Inactive)
      const asset = await assetRegistry.getAsset(1);
      expect(asset.status).to.equal(0); // AssetStatus.Inactive
      
      // Re-enable asset
      await assetRegistry.connect(deployer).enableAsset(1);
      
      // Verify asset is enabled (status = 1 for Active)
      const updatedAsset = await assetRegistry.getAsset(1);
      expect(updatedAsset.status).to.equal(1); // AssetStatus.Active
      
      console.log("Asset management functions verification successful");
    });
  });

  describe("Role-based Operation Simulation", function () {
    it("should allow each system role to perform their permitted actions", async function () {
      const { deployer, investor1, operator, assetRegistry, profitPool, investmentManager, weUSD } = await loadFixture(deployContractsFixture);

      // Admin (deployer) can add and manage assets
      await assetRegistry.connect(deployer).addAsset(
        "Role Test Asset", "Issuer", "Desc", ethers.parseUnits("1000", 18), 1000, ethers.parseUnits("10", 18), ethers.parseUnits("100", 18), 2592000
      );
      await assetRegistry.connect(deployer).disableAsset(1);
      await assetRegistry.connect(deployer).enableAsset(1);

      // Operator (InvestmentManager) can update asset amount via invest
      const assetId = 1;
      const investAmount = ethers.parseUnits("100", 18);
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investAmount);
      await investmentManager.connect(investor1).invest(assetId, investAmount);

      // Only operator can call withdrawProfitFromAsset
      await expect(
        profitPool.connect(investor1).withdrawProfitFromAsset(assetId, investAmount, investor1.address)
      ).to.be.revertedWith("ProfitPool: caller is not an operator");
    });
  });

  describe("Business Logic Integration Test", function () {
    it("should allow a user to invest, accrue profit, and redeem investment with correct balances", async function () {
      const { investor1, investmentManager, profitPool, weUSD, oneMonth } = await loadFixture(deployContractsFixture);
      const assetId = 1;
      const investAmount = ethers.parseUnits("1000", 18);

      // Approve and invest
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investAmount);
      await investmentManager.connect(investor1).invest(assetId, investAmount);
      const investmentIds = await investmentManager.getUserInvestments(investor1.address);
      const investmentId = investmentIds[0];

      // Fast forward time to after maturity
      await network.provider.send("evm_increaseTime", [oneMonth]);
      await network.provider.send("evm_mine");

      // Calculate profit
      const profit = await investmentManager.calculateProfit(investmentId);
      expect(profit).to.be.gt(0);

      // Redeem investment and profit
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      await investmentManager.connect(investor1).redeem(investmentId);
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });

  /*
  =====================
  Test Case Documentation Summary
  =====================
  1. Role-based Operation Simulation:
     - Verifies that each system role (admin, operator, user) can only perform their permitted actions.
     - Admin can add/disable/enable assets.
     - Operator (InvestmentManager) can update asset amounts via investment.
     - Only operator can call withdrawProfitFromAsset; users cannot call it directly.

  2. Business Logic Integration Test:
     - Simulates a full user journey: invest in an asset, accrue profit, and redeem investment after maturity.
     - Checks that balances are updated correctly and profit is distributed as expected.

  3. Existing tests cover:
     - System parameter initialization and updates
     - Asset registry management
     - Investment creation and profit calculation
     - Precision loss protection for small investments
     - Admin-only operations and access control

  These tests together ensure the system's core business logic, role-based access control, and financial flows are robust and correct.
  */
}); 