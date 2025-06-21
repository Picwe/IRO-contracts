// Deployment script - using CommonJS format
const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying account:", deployer.address);
  
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
  
  // Set APY for different periods
  await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
  await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
  await systemParameters.setPeriodAPY(twoWeeks, ethers.parseEther("0.15")); // 15% APY
  await systemParameters.setPeriodAPY(oneMonth, ethers.parseEther("0.20")); // 20% APY
  await systemParameters.setPeriodAPY(threeMonths, ethers.parseEther("0.25")); // 25% APY
  await systemParameters.setPeriodAPY(sixMonths, ethers.parseEther("0.30")); // 30% APY
  
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
  await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // Minimum investment 10 weUSD
  await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // Maximum investment 100M weUSD
  
  // Add investment limits to report
  deploymentReport.contracts.systemParameters.parameters.investmentLimits = {
    min: "10 weUSD",
    max: "100,000,000 weUSD"
  };
  
  // Set investment cooldown - set to 1 minute for testing
  await systemParameters.setInvestmentCooldown(60);
  
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
  
  // Add sample assets
  console.log("Adding sample assets...");
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
  const asset1Id = asset1Receipt.logs[0].args[0];
  
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
  const asset2Id = asset2Receipt.logs[0].args[0];
  
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
  await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // Add permissions to report
  deploymentReport.permissions.push({
    contract: "AssetRegistry",
    address: await assetRegistry.getAddress(),
    role: "OPERATOR_ROLE",
    grantee: "InvestmentManager",
    granteeAddress: await investmentManager.getAddress()
  });
  
  // Set investment manager as operator for profit pool
  await profitPool.grantOperatorRole(await investmentManager.getAddress());
  
  // Add permissions to report
  deploymentReport.permissions.push({
    contract: "ProfitPool",
    address: await profitPool.getAddress(),
    role: "OPERATOR_ROLE",
    grantee: "InvestmentManager",
    granteeAddress: await investmentManager.getAddress()
  });
  
  // Add some test funds to profit pool for each asset
  console.log("Adding test funds to profit pool...");
  await weUSD.mint(deployer.address, ethers.parseEther("10000")); // Mint 10000 weUSD
  await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
  // Deposit funds for each asset (asset 1 and asset 2)
  await profitPool.depositProfitForAsset(1, ethers.parseEther("5000"));
  await profitPool.depositProfitForAsset(2, ethers.parseEther("5000"));
  
  // Add test funds to report
  deploymentReport.contracts.profitPool.testFunds = {
    amount: "10,000 weUSD (5,000 for each asset)",
    from: deployer.address
  };
  
  // Collect role information
  const adminRole = await systemParameters.ADMIN_ROLE();
  const defaultAdminRole = await systemParameters.DEFAULT_ADMIN_ROLE();
  const operatorRole = await assetRegistry.OPERATOR_ROLE();
  
  // Add role information to report (not using getRoleMemberCount, directly record known role assignments)
  deploymentReport.roles = {
    systemParameters: {
      ADMIN_ROLE: {
        count: "1",
        members: [deployer.address]
      },
      DEFAULT_ADMIN_ROLE: {
        count: "1",
        members: [deployer.address]
      }
    },
    assetRegistry: {
      ADMIN_ROLE: {
        count: "1",
        members: [deployer.address]
      },
      OPERATOR_ROLE: {
        count: "1",
        members: [await investmentManager.getAddress()]
      }
    },
    profitPool: {
      ADMIN_ROLE: {
        count: "1",
        members: [deployer.address]
      },
      OPERATOR_ROLE: {
        count: "1",
        members: [await investmentManager.getAddress()]
      }
    },
    investmentManager: {
      ADMIN_ROLE: {
        count: "1",
        members: [deployer.address]
      }
    }
  };
  
  console.log("Deployment completed!");
  console.log("Contract addresses summary:");
  console.log("weUSD:", await weUSD.getAddress());
  console.log("SystemParameters:", await systemParameters.getAddress());
  console.log("AssetRegistry:", await assetRegistry.getAddress());
  console.log("ProfitPool:", await profitPool.getAddress());
  console.log("InvestmentManager:", await investmentManager.getAddress());
  
  // Generate report files
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
  
  markdown += `#### Parameter Settings\n\n`;
  markdown += `**APY Settings**:\n\n`;
  for (const [period, apy] of Object.entries(report.contracts.systemParameters.parameters.periodAPY)) {
    markdown += `- ${period} seconds: ${apy}\n`;
  }
  markdown += `\n**Investment Limits**:\n\n`;
  markdown += `- Minimum Investment: ${report.contracts.systemParameters.parameters.investmentLimits.min}\n`;
  markdown += `- Maximum Investment: ${report.contracts.systemParameters.parameters.investmentLimits.max}\n`;
  markdown += `- Investment Cooldown: ${report.contracts.systemParameters.parameters.investmentCooldown}\n\n`;
  
  // AssetRegistry
  markdown += `### AssetRegistry\n\n`;
  markdown += `- **Proxy Address**: \`${report.contracts.assetRegistry.address}\`\n`;
  markdown += `- **Implementation Address**: \`${report.contracts.assetRegistry.implementation}\`\n`;
  markdown += `- **Proxy Type**: ${report.contracts.assetRegistry.proxy}\n`;
  markdown += `- **Dependencies**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.assetRegistry.dependencies.systemParameters}\`\n\n`;
  
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
    markdown += `- Amount: ${report.contracts.profitPool.testFunds.amount}\n`;
    markdown += `- Source: \`${report.contracts.profitPool.testFunds.from}\`\n\n`;
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
  markdown += `## Permission Information\n\n`;
  for (const permission of report.permissions) {
    markdown += `- **${permission.contract}** (\`${permission.address}\`) granted **${permission.grantee}** (\`${permission.granteeAddress}\`) role: **${permission.role}**\n`;
  }
  markdown += `\n`;
  
  // Role details
  markdown += `## Role Details\n\n`;
  
  // SystemParameters roles
  markdown += `### SystemParameters Roles\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.systemParameters.ADMIN_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.systemParameters.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**DEFAULT_ADMIN_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.systemParameters.DEFAULT_ADMIN_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.systemParameters.DEFAULT_ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // AssetRegistry roles
  markdown += `### AssetRegistry Roles\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.assetRegistry.ADMIN_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.assetRegistry.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**OPERATOR_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.assetRegistry.OPERATOR_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.assetRegistry.OPERATOR_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // ProfitPool roles
  markdown += `### ProfitPool Roles\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.profitPool.ADMIN_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.profitPool.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**OPERATOR_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.profitPool.OPERATOR_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.profitPool.OPERATOR_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // InvestmentManager roles
  markdown += `### InvestmentManager Roles\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- Member Count: ${report.roles.investmentManager.ADMIN_ROLE.count}\n`;
  markdown += `- Members: ${report.roles.investmentManager.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  return markdown;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 