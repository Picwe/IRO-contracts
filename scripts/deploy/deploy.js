// 部署脚本 - 使用CommonJS格式
const { ethers, upgrades } = require("hardhat");

// 主要部署函数
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);
  
  // 部署 mock weUSD 代币
  console.log("开始部署 ERC20Mock (weUSD)...");
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
  await weUSD.waitForDeployment();
  console.log("ERC20Mock (weUSD) 已部署到:", await weUSD.getAddress());
  
  // 部署系统参数合约
  console.log("开始部署 SystemParameters...");
  const SystemParameters = await ethers.getContractFactory("SystemParameters");
  const systemParameters = await upgrades.deployProxy(SystemParameters, [deployer.address], {
    initializer: "initialize",
    kind: "uups"
  });
  await systemParameters.waitForDeployment();
  console.log("SystemParameters 已部署到:", await systemParameters.getAddress());
  
  // 设置系统参数
  console.log("设置系统参数...");
  const oneDay = 24 * 60 * 60; // 1天
  const oneWeek = 7 * oneDay;  // 1周
  const twoWeeks = 2 * oneWeek; // 2周
  const oneMonth = 30 * oneDay; // 1个月
  const threeMonths = 3 * oneMonth; // 3个月
  const sixMonths = 6 * oneMonth; // 6个月
  
  // 设置不同周期的APY
  await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
  await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
  await systemParameters.setPeriodAPY(twoWeeks, ethers.parseEther("0.15")); // 15% APY
  await systemParameters.setPeriodAPY(oneMonth, ethers.parseEther("0.20")); // 20% APY
  await systemParameters.setPeriodAPY(threeMonths, ethers.parseEther("0.25")); // 25% APY
  await systemParameters.setPeriodAPY(sixMonths, ethers.parseEther("0.30")); // 30% APY
  
  // 设置投资限制
  await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // 最小投资10 weUSD
  await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // 最大投资1亿 weUSD
  
  // 设置投资冷却期 - 设置为1分钟，便于测试
  await systemParameters.setInvestmentCooldown(60);
  
  // 部署资产注册合约
  console.log("开始部署 AssetRegistry...");
  const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer.address], {
    initializer: "initialize",
    kind: "uups"
  });
  await assetRegistry.waitForDeployment();
  console.log("AssetRegistry 已部署到:", await assetRegistry.getAddress());
  
  // 添加示例资产
  console.log("添加示例资产...");
  await assetRegistry.addAsset(
    "测试债券A", 
    "Test Bond A", 
    "这是一个测试债券资产", 
    "Test Inc.",
    ethers.parseEther("1000000"), // 100万 weUSD
    "https://example.com/image1.png"
  );
  
  await assetRegistry.addAsset(
    "测试债券B", 
    "Test Bond B", 
    "这是另一个测试债券资产", 
    "Test Corp.",
    ethers.parseEther("2000000"), // 200万 weUSD
    "https://example.com/image2.png"
  );
  
  // 部署收益池合约
  console.log("开始部署 ProfitPool...");
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
  console.log("ProfitPool 已部署到:", await profitPool.getAddress());
  
  // 部署投资管理合约
  console.log("开始部署 InvestmentManager...");
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
  console.log("InvestmentManager 已部署到:", await investmentManager.getAddress());
  
  // 部署风险监控合约
  console.log("开始部署 RiskMonitor...");
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
  console.log("RiskMonitor 已部署到:", await riskMonitor.getAddress());
  
  // 将投资管理合约设置为资产注册合约的操作者
  console.log("设置合约权限...");
  await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // 将投资管理合约设置为收益池合约的操作者
  await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // 向收益池添加一些测试资金
  console.log("向收益池添加测试资金...");
  await weUSD.mint(deployer.address, ethers.parseEther("10000")); // 铸造10000 weUSD
  await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
  await profitPool.depositProfit(ethers.parseEther("10000"));
  
  console.log("部署完成！");
  console.log("合约地址汇总：");
  console.log("weUSD:", await weUSD.getAddress());
  console.log("SystemParameters:", await systemParameters.getAddress());
  console.log("AssetRegistry:", await assetRegistry.getAddress());
  console.log("ProfitPool:", await profitPool.getAddress());
  console.log("InvestmentManager:", await investmentManager.getAddress());
  console.log("RiskMonitor:", await riskMonitor.getAddress());
}

// 执行部署
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 