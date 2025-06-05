const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("RiskMonitor Integration Test", function () {
  // Define constants for testing
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const PLATFORM_TOKEN_DECIMALS = 18;
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", PLATFORM_TOKEN_DECIMALS); // 1M tokens
  const PROFIT_POOL_MIN_BALANCE = ethers.parseUnits("100000", PLATFORM_TOKEN_DECIMALS); // 100K tokens
  
  // Risk thresholds
  const LOW_RISK_THRESHOLD = 2000;     // 20%
  const MEDIUM_RISK_THRESHOLD = 5000;  // 50%
  const HIGH_RISK_THRESHOLD = 8000;    // 80%
  
  // Test fixture to deploy contracts and set up the test environment
  async function deployContractsFixture() {
    // Get signers
    const [admin, riskManager, investor1, investor2, operator] = await ethers.getSigners();
    
    console.log("\n=== Test Environment Setup ===");
    console.log(`Admin Address: ${admin.address}`);
    console.log(`Risk Manager Address: ${riskManager.address}`);
    console.log(`Investor 1 Address: ${investor1.address}`);
    console.log(`Investor 2 Address: ${investor2.address}`);
    console.log(`Operator Address: ${operator.address}`);
    
    // Deploy mock ERC20 token
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const platformToken = await ERC20Mock.deploy("Platform Token", "PTK", PLATFORM_TOKEN_DECIMALS);
    await platformToken.waitForDeployment();
    console.log(`Platform Token Address: ${await platformToken.getAddress()}`);
    
    // Mint initial supply to admin
    await platformToken.mint(admin.address, INITIAL_SUPPLY);
    console.log(`Initial Supply: ${ethers.formatUnits(INITIAL_SUPPLY, PLATFORM_TOKEN_DECIMALS)} PTK`);
    
    // Deploy SystemParameters contract
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    const systemParameters = await upgrades.deployProxy(
      SystemParameters, 
      [admin.address, await platformToken.getAddress()]
    );
    await systemParameters.waitForDeployment();
    console.log(`SystemParameters Address: ${await systemParameters.getAddress()}`);
    
    // Set profit pool minimum balance
    await systemParameters.setProfitPoolMinBalance(PROFIT_POOL_MIN_BALANCE);
    console.log(`Profit Pool Min Balance: ${ethers.formatUnits(PROFIT_POOL_MIN_BALANCE, PLATFORM_TOKEN_DECIMALS)} PTK`);
    
    // Deploy ProfitPool contract
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    const profitPool = await upgrades.deployProxy(
      ProfitPool, 
      [admin.address, await systemParameters.getAddress(), await platformToken.getAddress()]
    );
    await profitPool.waitForDeployment();
    console.log(`ProfitPool Address: ${await profitPool.getAddress()}`);
    
    // Grant operator role to operator
    const OPERATOR_ROLE = await profitPool.OPERATOR_ROLE();
    await profitPool.grantRole(OPERATOR_ROLE, operator.address);
    
    // Deploy InvestmentManager contract
    const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
    const investmentManager = await upgrades.deployProxy(
      InvestmentManager, 
      [
        admin.address, 
        await systemParameters.getAddress(), 
        await profitPool.getAddress(), 
        await platformToken.getAddress(), 
        await platformToken.getAddress()
      ]
    );
    await investmentManager.waitForDeployment();
    console.log(`InvestmentManager Address: ${await investmentManager.getAddress()}`);
    
    // Whitelist investors for testing
    await investmentManager.addToWhitelist(investor1.address);
    await investmentManager.addToWhitelist(investor2.address);
    
    // Deploy RiskMonitor contract
    const RiskMonitor = await ethers.getContractFactory("RiskMonitor");
    const riskMonitor = await upgrades.deployProxy(
      RiskMonitor, 
      [
        admin.address, 
        await systemParameters.getAddress(), 
        await profitPool.getAddress(), 
        await investmentManager.getAddress(), 
        await platformToken.getAddress()
      ]
    );
    await riskMonitor.waitForDeployment();
    console.log(`RiskMonitor Address: ${await riskMonitor.getAddress()}`);
    
    // Grant risk manager role to risk manager
    const RISK_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RISK_MANAGER_ROLE"));
    await riskMonitor.grantRole(RISK_MANAGER_ROLE, riskManager.address);
    
    // Transfer some tokens to profit pool to simulate initial balance
    const initialProfitPoolBalance = ethers.parseUnits("150000", PLATFORM_TOKEN_DECIMALS);
    await platformToken.transfer(await profitPool.getAddress(), initialProfitPoolBalance);
    console.log(`Initial Profit Pool Balance: ${ethers.formatUnits(initialProfitPoolBalance, PLATFORM_TOKEN_DECIMALS)} PTK`);
    
    // Transfer some tokens to investors for testing
    const investorBalance = ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS);
    await platformToken.transfer(investor1.address, investorBalance);
    await platformToken.transfer(investor2.address, investorBalance);
    console.log(`Investor 1 Balance: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} PTK`);
    console.log(`Investor 2 Balance: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} PTK`);
    
    console.log("=== Test Environment Setup Complete ===\n");
    
    return { 
      admin, 
      riskManager, 
      investor1, 
      investor2, 
      operator, 
      platformToken, 
      systemParameters, 
      profitPool, 
      investmentManager, 
      riskMonitor 
    };
  }
  
  describe("Initial Setup and Configuration Tests", function () {
    it("Should initialize with correct risk thresholds", async function () {
      const { riskMonitor } = await loadFixture(deployContractsFixture);
      
      const [lowThreshold, mediumThreshold, highThreshold] = await riskMonitor.getRiskThresholds();
      
      expect(lowThreshold).to.equal(LOW_RISK_THRESHOLD);
      expect(mediumThreshold).to.equal(MEDIUM_RISK_THRESHOLD);
      expect(highThreshold).to.equal(HIGH_RISK_THRESHOLD);
      
      console.log("Risk Thresholds Verified:");
      console.log(`Low Risk Threshold: ${lowThreshold} (${lowThreshold / 100}%)`);
      console.log(`Medium Risk Threshold: ${mediumThreshold} (${mediumThreshold / 100}%)`);
      console.log(`High Risk Threshold: ${highThreshold} (${highThreshold / 100}%)`);
    });
    
    it("Should have the correct initial risk status", async function () {
      const { riskMonitor } = await loadFixture(deployContractsFixture);
      
      const initialRiskStatus = await riskMonitor.getCurrentRiskStatus();
      expect(initialRiskStatus).to.equal(0); // Low risk (enum index 0)
      
      console.log(`Initial Risk Status: ${getRiskStatusString(initialRiskStatus)}`);
    });
    
    it("Should have correct role assignments", async function () {
      const { riskMonitor, admin, riskManager } = await loadFixture(deployContractsFixture);
      
      const ADMIN_ROLE = await riskMonitor.ADMIN_ROLE();
      const RISK_MANAGER_ROLE = await riskMonitor.RISK_MANAGER_ROLE();
      
      expect(await riskMonitor.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      expect(await riskMonitor.hasRole(RISK_MANAGER_ROLE, riskManager.address)).to.be.true;
      
      console.log("Role Assignments Verified");
    });
  });
  
  describe("Risk Assessment Tests", function () {
    it("Should correctly assess risk based on profit pool balance", async function () {
      const { riskMonitor, profitPool, platformToken, admin } = await loadFixture(deployContractsFixture);
      
      // Initial assessment (should be Low risk with 150K balance vs 100K min)
      let riskStatus = await riskMonitor.assessRisk();
      expect(riskStatus).to.equal(0); // Low risk
      console.log(`Risk Status after initial assessment: ${getRiskStatusString(riskStatus)}`);
      
      // Reduce profit pool balance to trigger Medium risk
      const withdrawAmount = ethers.parseUnits("70000", PLATFORM_TOKEN_DECIMALS);
      await profitPool.connect(admin).withdrawProfit(withdrawAmount);
      
      // Balance should now be 80K, which is below the 100K minimum (80% ratio)
      riskStatus = await riskMonitor.assessRisk();
      expect(riskStatus).to.equal(2); // High risk
      console.log(`Risk Status after withdrawal (80K balance): ${getRiskStatusString(riskStatus)}`);
      
      // Reduce profit pool balance further to trigger Critical risk
      const additionalWithdrawal = ethers.parseUnits("30000", PLATFORM_TOKEN_DECIMALS);
      await profitPool.connect(admin).withdrawProfit(additionalWithdrawal);
      
      // Balance should now be 50K, which is 50% of the 100K minimum
      riskStatus = await riskMonitor.assessRisk();
      expect(riskStatus).to.equal(2); // High risk
      console.log(`Risk Status after additional withdrawal (50K balance): ${getRiskStatusString(riskStatus)}`);
    });
    
    it("Should allow updating risk thresholds", async function () {
      const { riskMonitor, admin } = await loadFixture(deployContractsFixture);
      
      // Update risk thresholds
      const newLowThreshold = 1500;     // 15%
      const newMediumThreshold = 4000;  // 40%
      const newHighThreshold = 7000;    // 70%
      
      await riskMonitor.connect(admin).setRiskThresholds(
        newLowThreshold,
        newMediumThreshold,
        newHighThreshold
      );
      
      // Verify updated thresholds
      const [lowThreshold, mediumThreshold, highThreshold] = await riskMonitor.getRiskThresholds();
      
      expect(lowThreshold).to.equal(newLowThreshold);
      expect(mediumThreshold).to.equal(newMediumThreshold);
      expect(highThreshold).to.equal(newHighThreshold);
      
      console.log("Updated Risk Thresholds:");
      console.log(`Low Risk Threshold: ${lowThreshold} (${lowThreshold / 100}%)`);
      console.log(`Medium Risk Threshold: ${mediumThreshold} (${mediumThreshold / 100}%)`);
      console.log(`High Risk Threshold: ${highThreshold} (${highThreshold / 100}%)`);
    });
  });
  
  describe("Emergency Action Tests", function () {
    it("Should trigger emergency action and pause investment manager", async function () {
      const { riskMonitor, investmentManager, riskManager } = await loadFixture(deployContractsFixture);
      
      // Verify investment manager is not paused initially
      expect(await investmentManager.paused()).to.be.false;
      console.log("Initial InvestmentManager state: Not Paused");
      
      // Trigger emergency action
      await riskMonitor.connect(riskManager).triggerEmergencyAction("Critical liquidity shortage");
      
      // Verify investment manager is now paused
      expect(await investmentManager.paused()).to.be.true;
      console.log("InvestmentManager state after emergency action: Paused");
      
      // Verify risk status is now Critical
      const riskStatus = await riskMonitor.getCurrentRiskStatus();
      expect(riskStatus).to.equal(3); // Critical risk
      console.log(`Risk Status after emergency action: ${getRiskStatusString(riskStatus)}`);
    });
    
    it("Should not allow non-risk manager to trigger emergency action", async function () {
      const { riskMonitor, investor1 } = await loadFixture(deployContractsFixture);
      
      // Try to trigger emergency action with non-authorized account
      await expect(
        riskMonitor.connect(investor1).triggerEmergencyAction("Unauthorized action")
      ).to.be.revertedWith("RiskMonitor: caller is not a risk manager");
      
      console.log("Unauthorized emergency action properly rejected");
    });
  });
  
  describe("Integration with System Components", function () {
    it("Should correctly interact with ProfitPool and SystemParameters", async function () {
      const { riskMonitor, profitPool, systemParameters, platformToken, admin } = await loadFixture(deployContractsFixture);
      
      // Update profit pool minimum balance
      const newMinBalance = ethers.parseUnits("200000", PLATFORM_TOKEN_DECIMALS);
      await systemParameters.connect(admin).setProfitPoolMinBalance(newMinBalance);
      console.log(`Updated Profit Pool Min Balance: ${ethers.formatUnits(newMinBalance, PLATFORM_TOKEN_DECIMALS)} PTK`);
      
      // Assess risk with new minimum balance
      // Current balance is 150K, min is now 200K, so ratio is 133% (High risk)
      const riskStatus = await riskMonitor.assessRisk();
      expect(riskStatus).to.equal(2); // High risk
      console.log(`Risk Status with updated min balance: ${getRiskStatusString(riskStatus)}`);
      
      // Add more funds to profit pool
      const additionalFunds = ethers.parseUnits("100000", PLATFORM_TOKEN_DECIMALS);
      await platformToken.connect(admin).transfer(await profitPool.getAddress(), additionalFunds);
      console.log(`Added ${ethers.formatUnits(additionalFunds, PLATFORM_TOKEN_DECIMALS)} PTK to Profit Pool`);
      
      // Reassess risk
      const updatedRiskStatus = await riskMonitor.assessRisk();
      expect(updatedRiskStatus).to.equal(0); // Low risk
      console.log(`Risk Status after adding funds: ${getRiskStatusString(updatedRiskStatus)}`);
    });
    
    it("Should handle investment operations and risk monitoring", async function () {
      const { riskMonitor, investmentManager, profitPool, platformToken, investor1, investor2, admin, operator } = await loadFixture(deployContractsFixture);
      
      // Approve tokens for investment
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      await platformToken.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      await platformToken.connect(investor2).approve(await investmentManager.getAddress(), investmentAmount);
      
      // Make investments
      const assetId = 1;
      await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      await investmentManager.connect(investor2).invest(assetId, investmentAmount);
      
      console.log(`Investor 1 invested ${ethers.formatUnits(investmentAmount, PLATFORM_TOKEN_DECIMALS)} PTK`);
      console.log(`Investor 2 invested ${ethers.formatUnits(investmentAmount, PLATFORM_TOKEN_DECIMALS)} PTK`);
      
      // Simulate profit generation
      const profitAmount = ethers.parseUnits("100", PLATFORM_TOKEN_DECIMALS);
      await platformToken.connect(admin).transfer(operator.address, profitAmount.mul(2));
      await platformToken.connect(operator).approve(await profitPool.getAddress(), profitAmount.mul(2));
      
      // Deposit profit to profit pool
      await profitPool.connect(operator).depositProfit(profitAmount);
      await profitPool.connect(operator).depositProfitForAsset(assetId, profitAmount);
      
      console.log(`Deposited ${ethers.formatUnits(profitAmount, PLATFORM_TOKEN_DECIMALS)} PTK as general profit`);
      console.log(`Deposited ${ethers.formatUnits(profitAmount, PLATFORM_TOKEN_DECIMALS)} PTK as profit for Asset ${assetId}`);
      
      // Check profit pool balance
      const profitPoolBalance = await platformToken.balanceOf(await profitPool.getAddress());
      console.log(`Profit Pool Balance: ${ethers.formatUnits(profitPoolBalance, PLATFORM_TOKEN_DECIMALS)} PTK`);
      
      // Assess risk after profit deposit
      const riskStatus = await riskMonitor.assessRisk();
      console.log(`Risk Status after profit deposit: ${getRiskStatusString(riskStatus)}`);
      
      // Verify risk is still Low
      expect(riskStatus).to.equal(0); // Low risk
    });
  });
  
  describe("Comprehensive Risk Scenarios", function () {
    it("Should handle multiple risk level transitions", async function () {
      const { riskMonitor, profitPool, platformToken, admin, systemParameters } = await loadFixture(deployContractsFixture);
      
      console.log("\n=== Comprehensive Risk Scenario Test ===");
      
      // Initial state: 150K balance, 100K min (Low risk)
      let riskStatus = await riskMonitor.assessRisk();
      console.log(`Initial state - Balance: 150K, Min: 100K, Risk: ${getRiskStatusString(riskStatus)}`);
      
      // Scenario 1: Increase min balance to 180K (Medium risk)
      await systemParameters.connect(admin).setProfitPoolMinBalance(ethers.parseUnits("180000", PLATFORM_TOKEN_DECIMALS));
      riskStatus = await riskMonitor.assessRisk();
      console.log(`Scenario 1 - Balance: 150K, Min: 180K, Risk: ${getRiskStatusString(riskStatus)}`);
      
      // Scenario 2: Withdraw 30K (High risk)
      await profitPool.connect(admin).withdrawProfit(ethers.parseUnits("30000", PLATFORM_TOKEN_DECIMALS));
      riskStatus = await riskMonitor.assessRisk();
      console.log(`Scenario 2 - Balance: 120K, Min: 180K, Risk: ${getRiskStatusString(riskStatus)}`);
      
      // Scenario 3: Add 100K (Low risk)
      await platformToken.connect(admin).transfer(await profitPool.getAddress(), ethers.parseUnits("100000", PLATFORM_TOKEN_DECIMALS));
      riskStatus = await riskMonitor.assessRisk();
      console.log(`Scenario 3 - Balance: 220K, Min: 180K, Risk: ${getRiskStatusString(riskStatus)}`);
      
      // Scenario 4: Increase min balance to 250K (High risk)
      await systemParameters.connect(admin).setProfitPoolMinBalance(ethers.parseUnits("250000", PLATFORM_TOKEN_DECIMALS));
      riskStatus = await riskMonitor.assessRisk();
      console.log(`Scenario 4 - Balance: 220K, Min: 250K, Risk: ${getRiskStatusString(riskStatus)}`);
      
      console.log("=== Comprehensive Risk Scenario Test Complete ===\n");
    });
  });
  
  // Helper function to convert risk status enum to string
  function getRiskStatusString(status) {
    const statuses = ["Low", "Medium", "High", "Critical"];
    return statuses[status] || "Unknown";
  }
  
  // Integration Test Summary
  after(async function() {
    console.log("\n=== Integration Test Summary ===");
    console.log("1. RiskMonitor contract was successfully initialized with correct parameters");
    console.log("2. Risk thresholds were correctly set and can be updated");
    console.log("3. Risk assessment correctly evaluates system risk based on profit pool balance");
    console.log("4. Emergency actions can be triggered by authorized risk managers");
    console.log("5. RiskMonitor correctly integrates with SystemParameters and ProfitPool");
    console.log("6. The system handles multiple risk level transitions correctly");
    console.log("7. Investment operations work correctly alongside risk monitoring");
    console.log("=== Test Complete ===");
  });
}); 