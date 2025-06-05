// Deployment script - using CommonJS format
const { ethers, upgrades } = require("hardhat");

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying account:", deployer.address);
  
  // Deploy mock weUSD token
  console.log("Deploying ERC20Mock (weUSD)...");
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
  await weUSD.waitForDeployment();
  console.log("ERC20Mock (weUSD) deployed to:", await weUSD.getAddress());
  
  // Deploy system parameters contract
  console.log("Deploying SystemParameters...");
  const SystemParameters = await ethers.getContractFactory("SystemParameters");
  const systemParameters = await upgrades.deployProxy(SystemParameters, [deployer.address], {
    initializer: "initialize",
    kind: "uups"
  });
  await systemParameters.waitForDeployment();
  console.log("SystemParameters deployed to:", await systemParameters.getAddress());
  
  // Set system parameters
  console.log("Setting system parameters...");
  const oneDay = 24 * 60 * 60; // 1 day
  const oneWeek = 7 * oneDay;  // 1 week
  const twoWeeks = 2 * oneWeek; // 2 weeks
  const oneMonth = 30 * oneDay; // 1 month
  const threeMonths = 3 * oneMonth; // 3 months
  const sixMonths = 6 * oneMonth; // 6 months
  
  // Set APY for different periods
  await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
  await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
  await systemParameters.setPeriodAPY(twoWeeks, ethers.parseEther("0.15")); // 15% APY
  await systemParameters.setPeriodAPY(oneMonth, ethers.parseEther("0.20")); // 20% APY
  await systemParameters.setPeriodAPY(threeMonths, ethers.parseEther("0.25")); // 25% APY
  await systemParameters.setPeriodAPY(sixMonths, ethers.parseEther("0.30")); // 30% APY
  
  // Set investment limits
  await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // Minimum investment 10 weUSD
  await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // Maximum investment 100M weUSD
  
  // Set investment cooldown - set to 1 minute for testing
  await systemParameters.setInvestmentCooldown(60);
  
  // Deploy asset registry contract
  console.log("Deploying AssetRegistry...");
  const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer.address], {
    initializer: "initialize",
    kind: "uups"
  });
  await assetRegistry.waitForDeployment();
  console.log("AssetRegistry deployed to:", await assetRegistry.getAddress());
  
  // Add sample assets
  console.log("Adding sample assets...");
  await assetRegistry.addAsset(
    "Test Bond A", 
    "Test Bond A", 
    "This is a test bond asset", 
    "Test Inc.",
    ethers.parseEther("1000000"), // 1M weUSD
    "https://example.com/image1.png"
  );
  
  await assetRegistry.addAsset(
    "Test Bond B", 
    "Test Bond B", 
    "This is another test bond asset", 
    "Test Corp.",
    ethers.parseEther("2000000"), // 2M weUSD
    "https://example.com/image2.png"
  );
  
  // Deploy profit pool contract
  console.log("Deploying ProfitPool...");
  const ProfitPool = await ethers.getContractFactory("ProfitPool");
  const profitPool = await upgrades.deployProxy(ProfitPool, [
    deployer.address,
    await systemParameters.getAddress(),
    await weUSD.getAddress()
  ], {
    initializer: "initialize",
    kind: "uups"
  });
  await profitPool.waitForDeployment();
  console.log("ProfitPool deployed to:", await profitPool.getAddress());
  
  // Deploy investment manager contract
  console.log("Deploying InvestmentManager...");
  const InvestmentManager = await ethers.getContractFactory("InvestmentManager");
  const investmentManager = await upgrades.deployProxy(InvestmentManager, [
    deployer.address,
    await systemParameters.getAddress(),
    await assetRegistry.getAddress(),
    await profitPool.getAddress(),
    await weUSD.getAddress()
  ], {
    initializer: "initialize",
    kind: "uups"
  });
  await investmentManager.waitForDeployment();
  console.log("InvestmentManager deployed to:", await investmentManager.getAddress());
  
  // Deploy risk monitor contract
  console.log("Deploying RiskMonitor...");
  const RiskMonitor = await ethers.getContractFactory("RiskMonitor");
  const riskMonitor = await upgrades.deployProxy(RiskMonitor, [
    deployer.address,
    await systemParameters.getAddress(),
    await profitPool.getAddress(),
    await investmentManager.getAddress(),
    await weUSD.getAddress()
  ], {
    initializer: "initialize",
    kind: "uups"
  });
  await riskMonitor.waitForDeployment();
  console.log("RiskMonitor deployed to:", await riskMonitor.getAddress());
  
  // Set investment manager as operator for asset registry
  console.log("Setting contract permissions...");
  await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // Set investment manager as operator for profit pool
  await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // Add some test funds to profit pool
  console.log("Adding test funds to profit pool...");
  await weUSD.mint(deployer.address, ethers.parseEther("10000")); // Mint 10000 weUSD
  await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
  await profitPool.depositProfit(ethers.parseEther("10000"));
  
  console.log("Deployment completed!");
  console.log("Contract addresses summary:");
  console.log("weUSD:", await weUSD.getAddress());
  console.log("SystemParameters:", await systemParameters.getAddress());
  console.log("AssetRegistry:", await assetRegistry.getAddress());
  console.log("ProfitPool:", await profitPool.getAddress());
  console.log("InvestmentManager:", await investmentManager.getAddress());
  console.log("RiskMonitor:", await riskMonitor.getAddress());
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 