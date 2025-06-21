// Deployment script with delays - using CommonJS format
const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 延时函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying account:", deployer.address);
  
  // 延时时间 (毫秒)
  const DELAY_TIME = 5000; // 5秒
  
  // Create report object
  const deploymentReport = {
    environment: {
      network: network.name,
      chainId: network.config.chainId,
      deployTime: new Date().toISOString(),
      deployer: deployer.address
    },
    contracts: {},
    permissions: []
  };
  
  // Deploy mock weUSD token
  console.log("Deploying ERC20Mock (weUSD)...");
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
  await weUSD.waitForDeployment();
  console.log("ERC20Mock (weUSD) deployed to:", await weUSD.getAddress());
  
  // 延时
  console.log(`Waiting for ${DELAY_TIME/1000} seconds...`);
  await delay(DELAY_TIME);
  
  // Add to report
  deploymentReport.contracts.weUSD = {
    address: await weUSD.getAddress(),
    name: "weUSD",
    symbol: "weUSD",
    decimals: 18,
    type: "ERC20Mock"
  };
  
  // Deploy system parameters contract
  console.log("Deploying SystemParameters...");
  const SystemParameters = await ethers.getContractFactory("SystemParameters");
  const systemParameters = await upgrades.deployProxy(SystemParameters, [deployer.address, await weUSD.getAddress()], {
    initializer: "initialize",
    kind: "uups"
  });
  await systemParameters.waitForDeployment();
  console.log("SystemParameters deployed to:", await systemParameters.getAddress());
  
  // 延时
  console.log(`Waiting for ${DELAY_TIME/1000} seconds...`);
  await delay(DELAY_TIME);
  
  // Add to report
  deploymentReport.contracts.systemParameters = {
    address: await systemParameters.getAddress(),
    implementation: await upgrades.erc1967.getImplementationAddress(await systemParameters.getAddress()),
    type: "SystemParameters",
    proxy: "UUPS"
  };
  
  // Set system parameters
  console.log("Setting system parameters...");
  const oneDay = 24 * 60 * 60; // 1 day
  const oneWeek = 7 * oneDay;  // 1 week
  const twoWeeks = 2 * oneWeek; // 2 weeks
  const oneMonth = 30 * oneDay; // 1 month
  const threeMonths = 3 * oneMonth; // 3 months
  const sixMonths = 6 * oneMonth; // 6 months
  
  // Set APY for different periods - 为每个交易添加延时
  console.log("Setting APY for oneDay...");
  await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
  await delay(DELAY_TIME);
  
  console.log("Setting APY for oneWeek...");
  await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
  await delay(DELAY_TIME);
  
  console.log("Setting APY for twoWeeks...");
  await systemParameters.setPeriodAPY(twoWeeks, ethers.parseEther("0.15")); // 15% APY
  await delay(DELAY_TIME);
  
  console.log("Setting APY for oneMonth...");
  await systemParameters.setPeriodAPY(oneMonth, ethers.parseEther("0.20")); // 20% APY
  await delay(DELAY_TIME);
  
  console.log("Setting APY for threeMonths...");
  await systemParameters.setPeriodAPY(threeMonths, ethers.parseEther("0.25")); // 25% APY
  await delay(DELAY_TIME);
  
  console.log("Setting APY for sixMonths...");
  await systemParameters.setPeriodAPY(sixMonths, ethers.parseEther("0.30")); // 30% APY
  await delay(DELAY_TIME);
  
  // Add parameters to report
  deploymentReport.contracts.systemParameters.parameters = {
    periodAPY: {
      [oneDay]: "5%",
      [oneWeek]: "10%",
      [twoWeeks]: "15%",
      [oneMonth]: "20%",
      [threeMonths]: "25%",
      [sixMonths]: "30%"
    }
  };
  
  // Set investment limits
  console.log("Setting min investment amount...");
  await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // Minimum investment 10 weUSD
  await delay(DELAY_TIME);
  
  console.log("Setting max investment amount...");
  await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // Maximum investment 100M weUSD
  await delay(DELAY_TIME);
  
  // Add investment limits to report
  deploymentReport.contracts.systemParameters.parameters.investmentLimits = {
    min: "10 weUSD",
    max: "100,000,000 weUSD"
  };
  
  // Set investment cooldown - set to 1 minute for testing
  console.log("Setting investment cooldown...");
  await systemParameters.setInvestmentCooldown(60);
  await delay(DELAY_TIME);
  
  // Add cooldown to report
  deploymentReport.contracts.systemParameters.parameters.investmentCooldown = "60 seconds";
  
  // Deploy asset registry contract
  console.log("Deploying AssetRegistry...");
  const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer.address, await systemParameters.getAddress()], {
    initializer: "initialize",
    kind: "uups"
  });
  await assetRegistry.waitForDeployment();
  console.log("AssetRegistry deployed to:", await assetRegistry.getAddress());
  
  // 延时
  console.log(`Waiting for ${DELAY_TIME/1000} seconds...`);
  await delay(DELAY_TIME);
  
  // Add to report
  deploymentReport.contracts.assetRegistry = {
    address: await assetRegistry.getAddress(),
    implementation: await upgrades.erc1967.getImplementationAddress(await assetRegistry.getAddress()),
    type: "AssetRegistry",
    proxy: "UUPS",
    dependencies: {
      systemParameters: await systemParameters.getAddress()
    }
  };
  
  // Add sample assets - 保存资产ID以便后续使用
  console.log("Adding sample assets...");
  let asset1Id, asset2Id;
  
  try {
    console.log("Adding asset 1...");
    const asset1Tx = await assetRegistry.addAsset(
      "Test Bond A", 
      "Test Inc.", 
      "This is a test bond asset", 
      ethers.parseEther("1000000"), // 1M weUSD max amount
      ethers.parseEther("0.10"), // 10% APY
      ethers.parseEther("100"), // 100 weUSD min investment
      ethers.parseEther("10000"), // 10K weUSD max investment per user
      oneMonth // 1 month period
    );
    const asset1Receipt = await asset1Tx.wait();
    asset1Id = asset1Receipt.logs[0].args[0];
    console.log(`Added asset 1 with ID: ${asset1Id}`);
    await delay(DELAY_TIME);
    
    console.log("Adding asset 2...");
    const asset2Tx = await assetRegistry.addAsset(
      "Test Bond B", 
      "Test Corp.", 
      "This is another test bond asset", 
      ethers.parseEther("2000000"), // 2M weUSD max amount
      ethers.parseEther("0.15"), // 15% APY
      ethers.parseEther("500"), // 500 weUSD min investment
      ethers.parseEther("20000"), // 20K weUSD max investment per user
      threeMonths // 3 months period
    );
    const asset2Receipt = await asset2Tx.wait();
    asset2Id = asset2Receipt.logs[0].args[0];
    console.log(`Added asset 2 with ID: ${asset2Id}`);
    await delay(DELAY_TIME);
    
    // Add assets to report
    deploymentReport.contracts.assetRegistry.assets = [
      {
        id: asset1Id.toString(),
        name: "Test Bond A",
        issuer: "Test Inc.",
        description: "This is a test bond asset",
        maxAmount: "1,000,000 weUSD",
        apy: "10%",
        minInvestment: "100 weUSD",
        maxInvestment: "10,000 weUSD",
        period: `${oneMonth} seconds (${oneMonth / 86400} days)`
      },
      {
        id: asset2Id.toString(),
        name: "Test Bond B",
        issuer: "Test Corp.",
        description: "This is another test bond asset",
        maxAmount: "2,000,000 weUSD",
        apy: "15%",
        minInvestment: "500 weUSD",
        maxInvestment: "20,000 weUSD",
        period: `${threeMonths} seconds (${threeMonths / 86400} days)`
      }
    ];
  } catch (error) {
    console.error("Failed to add sample assets:", error.message);
    deploymentReport.contracts.assetRegistry.assets = [];
  }
  
  // Deploy profit pool contract
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
  console.log("ProfitPool deployed to:", await profitPool.getAddress());
  
  // 延时
  console.log(`Waiting for ${DELAY_TIME/1000} seconds...`);
  await delay(DELAY_TIME);
  
  // Add to report
  deploymentReport.contracts.profitPool = {
    address: await profitPool.getAddress(),
    implementation: await upgrades.erc1967.getImplementationAddress(await profitPool.getAddress()),
    type: "ProfitPool",
    proxy: "UUPS",
    dependencies: {
      systemParameters: await systemParameters.getAddress(),
      assetRegistry: await assetRegistry.getAddress()
    }
  };
  
  // Deploy investment manager contract
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
  console.log("InvestmentManager deployed to:", await investmentManager.getAddress());
  
  // 延时
  console.log(`Waiting for ${DELAY_TIME/1000} seconds...`);
  await delay(DELAY_TIME);
  
  // Add to report
  deploymentReport.contracts.investmentManager = {
    address: await investmentManager.getAddress(),
    implementation: await upgrades.erc1967.getImplementationAddress(await investmentManager.getAddress()),
    type: "InvestmentManager",
    proxy: "UUPS",
    dependencies: {
      systemParameters: await systemParameters.getAddress(),
      assetRegistry: await assetRegistry.getAddress(),
      profitPool: await profitPool.getAddress()
    }
  };
  
  // Set investment manager as operator for asset registry
  console.log("Setting contract permissions...");
  try {
    console.log("Granting OPERATOR_ROLE to InvestmentManager in AssetRegistry...");
    await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
    console.log("Granted OPERATOR_ROLE to InvestmentManager in AssetRegistry");
    await delay(DELAY_TIME);
    
    // Add permissions to report
    deploymentReport.permissions.push({
      contract: "AssetRegistry",
      address: await assetRegistry.getAddress(),
      role: "OPERATOR_ROLE",
      grantee: "InvestmentManager",
      granteeAddress: await investmentManager.getAddress()
    });
    
    // Set investment manager as operator for profit pool
    console.log("Granting OPERATOR_ROLE to InvestmentManager in ProfitPool...");
    await profitPool.grantOperatorRole(await investmentManager.getAddress());
    console.log("Granted OPERATOR_ROLE to InvestmentManager in ProfitPool");
    await delay(DELAY_TIME);
    
    // Add permissions to report
    deploymentReport.permissions.push({
      contract: "ProfitPool",
      address: await profitPool.getAddress(),
      role: "OPERATOR_ROLE",
      grantee: "InvestmentManager",
      granteeAddress: await investmentManager.getAddress()
    });
  } catch (error) {
    console.error("Failed to set contract permissions:", error.message);
  }
  
  // 添加测试资金到利润池 - 使用资产ID特定的depositProfitForAsset
  console.log("Adding test funds to profit pool...");
  try {
    if (asset1Id) {
      // 向资产1的利润池中存入资金
      console.log(`Minting 5,000 weUSD to deployer for asset ID ${asset1Id}...`);
      await weUSD.mint(deployer.address, ethers.parseEther("5000")); 
      await delay(DELAY_TIME);
      
      console.log(`Approving 5,000 weUSD to ProfitPool for asset ID ${asset1Id}...`);
      await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("5000"));
      await delay(DELAY_TIME);
      
      console.log(`Depositing 5,000 weUSD to profit pool for asset ID ${asset1Id}...`);
      await profitPool.depositProfitForAsset(asset1Id, ethers.parseEther("5000"));
      await delay(DELAY_TIME);
      console.log(`Deposited 5,000 weUSD to profit pool for asset ID ${asset1Id}`);
    }
    
    if (asset2Id) {
      // 向资产2的利润池中存入资金
      console.log(`Minting 5,000 weUSD to deployer for asset ID ${asset2Id}...`);
      await weUSD.mint(deployer.address, ethers.parseEther("5000")); 
      await delay(DELAY_TIME);
      
      console.log(`Approving 5,000 weUSD to ProfitPool for asset ID ${asset2Id}...`);
      await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("5000"));
      await delay(DELAY_TIME);
      
      console.log(`Depositing 5,000 weUSD to profit pool for asset ID ${asset2Id}...`);
      await profitPool.depositProfitForAsset(asset2Id, ethers.parseEther("5000"));
      await delay(DELAY_TIME);
      console.log(`Deposited 5,000 weUSD to profit pool for asset ID ${asset2Id}`);
    }
    
    // 添加到报告
    deploymentReport.contracts.profitPool.testFunds = {
      amount: "10,000 weUSD",
      from: deployer.address,
      note: "Funds split between asset-specific profit pools"
    };
  } catch (error) {
    console.error("Failed to add test funds to profit pool:", error.message);
    // 如果出错，仍然在报告中记录尝试
    deploymentReport.contracts.profitPool.testFunds = {
      amount: "10,000 weUSD (failed to add)",
      from: deployer.address,
      error: error.message
    };
  }
  
  console.log("Deployment completed!");
  console.log("Contract addresses summary:");
  console.log("weUSD:", await weUSD.getAddress());
  console.log("SystemParameters:", await systemParameters.getAddress());
  console.log("AssetRegistry:", await assetRegistry.getAddress());
  console.log("ProfitPool:", await profitPool.getAddress());
  console.log("InvestmentManager:", await investmentManager.getAddress());
  
  // Generate report files
  try {
    const reportDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `deployment-report-${network.name}-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(deploymentReport, null, 2));
    console.log(`Deployment report saved to: ${reportPath}`);
    
    // Generate more readable Markdown report
    const markdownReport = generateMarkdownReport(deploymentReport);
    const markdownPath = path.join(reportDir, `deployment-report-${network.name}-${timestamp}.md`);
    fs.writeFileSync(markdownPath, markdownReport);
    console.log(`Markdown report saved to: ${markdownPath}`);
  } catch (error) {
    console.error("Failed to generate report files:", error.message);
  }
  
  // 保存合约地址到.env文件，方便后续验证
  try {
    const envContent = `
# 部署于 ${new Date().toISOString()} 在 ${network.name} 网络上的合约地址
SYSTEM_PARAMETERS_ADDRESS=${await systemParameters.getAddress()}
ASSET_REGISTRY_ADDRESS=${await assetRegistry.getAddress()}
PROFIT_POOL_ADDRESS=${await profitPool.getAddress()}
INVESTMENT_MANAGER_ADDRESS=${await investmentManager.getAddress()}
WEUSD_ADDRESS=${await weUSD.getAddress()}
`;
    fs.writeFileSync(path.join(__dirname, '../../.env.contracts'), envContent);
    console.log("Contract addresses saved to .env.contracts");
  } catch (error) {
    console.error("Failed to save contract addresses:", error.message);
  }
}

// Generate Markdown format report
function generateMarkdownReport(report) {
  let markdown = `# Deployment Report - ${report.environment.network}\n\n`;
  
  // Environment information
  markdown += `## Environment Information\n\n`;
  markdown += `- **Network**: ${report.environment.network}\n`;
  markdown += `- **Chain ID**: ${report.environment.chainId}\n`;
  markdown += `- **Deployment Time**: ${report.environment.deployTime}\n`;
  markdown += `- **Deployer Account**: ${report.environment.deployer}\n\n`;
  
  // Contract information
  markdown += `## Contract Information\n\n`;
  
  // weUSD
  markdown += `### weUSD Token\n\n`;
  markdown += `- **Address**: \`${report.contracts.weUSD.address}\`\n`;
  markdown += `- **Name**: ${report.contracts.weUSD.name}\n`;
  markdown += `- **Symbol**: ${report.contracts.weUSD.symbol}\n`;
  markdown += `- **Decimals**: ${report.contracts.weUSD.decimals}\n\n`;
  
  // SystemParameters
  markdown += `### SystemParameters\n\n`;
  markdown += `- **Proxy Address**: \`${report.contracts.systemParameters.address}\`\n`;
  markdown += `- **Implementation Address**: \`${report.contracts.systemParameters.implementation}\`\n`;
  markdown += `- **Proxy Type**: ${report.contracts.systemParameters.proxy}\n\n`;
  
  if (report.contracts.systemParameters.parameters) {
    markdown += `#### Parameter Settings\n\n`;
    markdown += `**APY Settings**:\n\n`;
    for (const [period, apy] of Object.entries(report.contracts.systemParameters.parameters.periodAPY)) {
      markdown += `- ${period} seconds: ${apy}\n`;
    }
    markdown += `\n**Investment Limits**:\n\n`;
    markdown += `- Minimum Investment: ${report.contracts.systemParameters.parameters.investmentLimits.min}\n`;
    markdown += `- Maximum Investment: ${report.contracts.systemParameters.parameters.investmentLimits.max}\n`;
    markdown += `- Investment Cooldown: ${report.contracts.systemParameters.parameters.investmentCooldown}\n\n`;
  }
  
  // AssetRegistry
  markdown += `### AssetRegistry\n\n`;
  markdown += `- **Proxy Address**: \`${report.contracts.assetRegistry.address}\`\n`;
  markdown += `- **Implementation Address**: \`${report.contracts.assetRegistry.implementation}\`\n`;
  markdown += `- **Proxy Type**: ${report.contracts.assetRegistry.proxy}\n`;
  markdown += `- **Dependencies**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.assetRegistry.dependencies.systemParameters}\`\n\n`;
  
  if (report.contracts.assetRegistry.assets && report.contracts.assetRegistry.assets.length > 0) {
    markdown += `#### Assets\n\n`;
    for (const asset of report.contracts.assetRegistry.assets) {
      markdown += `**${asset.name}**:\n\n`;
      markdown += `- ID: ${asset.id}\n`;
      markdown += `- Issuer: ${asset.issuer}\n`;
      markdown += `- Description: ${asset.description}\n`;
      markdown += `- Maximum Amount: ${asset.maxAmount}\n`;
      markdown += `- APY: ${asset.apy}\n`;
      markdown += `- Minimum Investment: ${asset.minInvestment}\n`;
      markdown += `- Maximum Investment: ${asset.maxInvestment}\n`;
      markdown += `- Period: ${asset.period}\n\n`;
    }
  } else {
    markdown += `#### Assets\n\n`;
    markdown += `No assets were added or there was an error adding assets.\n\n`;
  }
  
  // ProfitPool
  markdown += `### ProfitPool\n\n`;
  markdown += `- **Proxy Address**: \`${report.contracts.profitPool.address}\`\n`;
  markdown += `- **Implementation Address**: \`${report.contracts.profitPool.implementation}\`\n`;
  markdown += `- **Proxy Type**: ${report.contracts.profitPool.proxy}\n`;
  markdown += `- **Dependencies**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.profitPool.dependencies.systemParameters}\`\n`;
  markdown += `  - AssetRegistry: \`${report.contracts.profitPool.dependencies.assetRegistry}\`\n\n`;
  
  if (report.contracts.profitPool.testFunds) {
    markdown += `#### Test Funds\n\n`;
    if (report.contracts.profitPool.testFunds.amount) {
      markdown += `- Amount: ${report.contracts.profitPool.testFunds.amount}\n`;
    }
    if (report.contracts.profitPool.testFunds.from) {
      markdown += `- Source: \`${report.contracts.profitPool.testFunds.from}\`\n`;
    }
    if (report.contracts.profitPool.testFunds.note) {
      markdown += `- Note: ${report.contracts.profitPool.testFunds.note}\n`;
    }
    if (report.contracts.profitPool.testFunds.error) {
      markdown += `- Error: ${report.contracts.profitPool.testFunds.error}\n`;
    }
    markdown += `\n`;
  }
  
  // InvestmentManager
  markdown += `### InvestmentManager\n\n`;
  markdown += `- **Proxy Address**: \`${report.contracts.investmentManager.address}\`\n`;
  markdown += `- **Implementation Address**: \`${report.contracts.investmentManager.implementation}\`\n`;
  markdown += `- **Proxy Type**: ${report.contracts.investmentManager.proxy}\n`;
  markdown += `- **Dependencies**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.investmentManager.dependencies.systemParameters}\`\n`;
  markdown += `  - AssetRegistry: \`${report.contracts.investmentManager.dependencies.assetRegistry}\`\n`;
  markdown += `  - ProfitPool: \`${report.contracts.investmentManager.dependencies.profitPool}\`\n\n`;
  
  // Permission information
  if (report.permissions && report.permissions.length > 0) {
    markdown += `## Permission Information\n\n`;
    for (const permission of report.permissions) {
      markdown += `- **${permission.contract}** (\`${permission.address}\`) granted **${permission.grantee}** (\`${permission.granteeAddress}\`) role: **${permission.role}**\n`;
    }
    markdown += `\n`;
  }
  
  return markdown;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 