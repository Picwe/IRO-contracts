// Deployment script - using CommonJS format
const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Main deployment function
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying account:", deployer.address);
  
  // 创建报告对象
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
  
  // 添加到报告
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
  
  // 添加到报告
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
  
  // 添加参数到报告
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
  
  // 添加投资限制到报告
  deploymentReport.contracts.systemParameters.parameters.investmentLimits = {
    min: "10 weUSD",
    max: "100,000,000 weUSD"
  };
  
  // Set investment cooldown - set to 1 minute for testing
  await systemParameters.setInvestmentCooldown(60);
  
  // 添加冷却期到报告
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
  
  // 添加到报告
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
  
  // 添加资产到报告
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
  
  // 添加到报告
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
  
  // 添加到报告
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
  
  // 添加权限到报告
  deploymentReport.permissions.push({
    contract: "AssetRegistry",
    address: await assetRegistry.getAddress(),
    role: "OPERATOR_ROLE",
    grantee: "InvestmentManager",
    granteeAddress: await investmentManager.getAddress()
  });
  
  // Set investment manager as operator for profit pool
  await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
  
  // 添加权限到报告
  deploymentReport.permissions.push({
    contract: "ProfitPool",
    address: await profitPool.getAddress(),
    role: "OPERATOR_ROLE",
    grantee: "InvestmentManager",
    granteeAddress: await investmentManager.getAddress()
  });
  
  // Add some test funds to profit pool
  console.log("Adding test funds to profit pool...");
  await weUSD.mint(deployer.address, ethers.parseEther("10000")); // Mint 10000 weUSD
  await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
  await profitPool.depositProfit(ethers.parseEther("10000"));
  
  // 添加测试资金到报告
  deploymentReport.contracts.profitPool.testFunds = {
    amount: "10,000 weUSD",
    from: deployer.address
  };
  
  // 收集角色信息
  const adminRole = await systemParameters.ADMIN_ROLE();
  const defaultAdminRole = await systemParameters.DEFAULT_ADMIN_ROLE();
  const operatorRole = await assetRegistry.OPERATOR_ROLE();
  
  // 添加角色信息到报告 (不使用getRoleMemberCount，直接记录已知的角色分配)
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
  
  // 生成报告文件
  const reportDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `deployment-report-${network.name}-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(deploymentReport, null, 2));
  console.log(`Deployment report saved to: ${reportPath}`);
  
  // 生成可读性更强的Markdown报告
  const markdownReport = generateMarkdownReport(deploymentReport);
  const markdownPath = path.join(reportDir, `deployment-report-${network.name}-${timestamp}.md`);
  fs.writeFileSync(markdownPath, markdownReport);
  console.log(`Markdown report saved to: ${markdownPath}`);
}

// 生成Markdown格式的报告
function generateMarkdownReport(report) {
  let markdown = `# 部署报告 - ${report.environment.network}\n\n`;
  
  // 环境信息
  markdown += `## 环境信息\n\n`;
  markdown += `- **网络**: ${report.environment.network}\n`;
  markdown += `- **链ID**: ${report.environment.chainId}\n`;
  markdown += `- **部署时间**: ${report.environment.deployTime}\n`;
  markdown += `- **部署账户**: ${report.environment.deployer}\n\n`;
  
  // 合约信息
  markdown += `## 合约信息\n\n`;
  
  // weUSD
  markdown += `### weUSD Token\n\n`;
  markdown += `- **地址**: \`${report.contracts.weUSD.address}\`\n`;
  markdown += `- **名称**: ${report.contracts.weUSD.name}\n`;
  markdown += `- **符号**: ${report.contracts.weUSD.symbol}\n`;
  markdown += `- **小数位**: ${report.contracts.weUSD.decimals}\n\n`;
  
  // SystemParameters
  markdown += `### SystemParameters\n\n`;
  markdown += `- **代理地址**: \`${report.contracts.systemParameters.address}\`\n`;
  markdown += `- **实现地址**: \`${report.contracts.systemParameters.implementation}\`\n`;
  markdown += `- **代理类型**: ${report.contracts.systemParameters.proxy}\n\n`;
  
  markdown += `#### 参数设置\n\n`;
  markdown += `**APY设置**:\n\n`;
  for (const [period, apy] of Object.entries(report.contracts.systemParameters.parameters.periodAPY)) {
    markdown += `- ${period}秒: ${apy}\n`;
  }
  markdown += `\n**投资限制**:\n\n`;
  markdown += `- 最小投资额: ${report.contracts.systemParameters.parameters.investmentLimits.min}\n`;
  markdown += `- 最大投资额: ${report.contracts.systemParameters.parameters.investmentLimits.max}\n`;
  markdown += `- 投资冷却期: ${report.contracts.systemParameters.parameters.investmentCooldown}\n\n`;
  
  // AssetRegistry
  markdown += `### AssetRegistry\n\n`;
  markdown += `- **代理地址**: \`${report.contracts.assetRegistry.address}\`\n`;
  markdown += `- **实现地址**: \`${report.contracts.assetRegistry.implementation}\`\n`;
  markdown += `- **代理类型**: ${report.contracts.assetRegistry.proxy}\n`;
  markdown += `- **依赖**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.assetRegistry.dependencies.systemParameters}\`\n\n`;
  
  markdown += `#### 资产\n\n`;
  for (const asset of report.contracts.assetRegistry.assets) {
    markdown += `**${asset.name}**:\n\n`;
    markdown += `- ID: ${asset.id}\n`;
    markdown += `- 发行方: ${asset.issuer}\n`;
    markdown += `- 描述: ${asset.description}\n`;
    markdown += `- 最大金额: ${asset.maxAmount}\n`;
    markdown += `- APY: ${asset.apy}\n`;
    markdown += `- 最小投资: ${asset.minInvestment}\n`;
    markdown += `- 最大投资: ${asset.maxInvestment}\n`;
    markdown += `- 周期: ${asset.period}\n\n`;
  }
  
  // ProfitPool
  markdown += `### ProfitPool\n\n`;
  markdown += `- **代理地址**: \`${report.contracts.profitPool.address}\`\n`;
  markdown += `- **实现地址**: \`${report.contracts.profitPool.implementation}\`\n`;
  markdown += `- **代理类型**: ${report.contracts.profitPool.proxy}\n`;
  markdown += `- **依赖**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.profitPool.dependencies.systemParameters}\`\n`;
  markdown += `  - AssetRegistry: \`${report.contracts.profitPool.dependencies.assetRegistry}\`\n\n`;
  
  if (report.contracts.profitPool.testFunds) {
    markdown += `#### 测试资金\n\n`;
    markdown += `- 金额: ${report.contracts.profitPool.testFunds.amount}\n`;
    markdown += `- 来源: \`${report.contracts.profitPool.testFunds.from}\`\n\n`;
  }
  
  // InvestmentManager
  markdown += `### InvestmentManager\n\n`;
  markdown += `- **代理地址**: \`${report.contracts.investmentManager.address}\`\n`;
  markdown += `- **实现地址**: \`${report.contracts.investmentManager.implementation}\`\n`;
  markdown += `- **代理类型**: ${report.contracts.investmentManager.proxy}\n`;
  markdown += `- **依赖**:\n`;
  markdown += `  - SystemParameters: \`${report.contracts.investmentManager.dependencies.systemParameters}\`\n`;
  markdown += `  - AssetRegistry: \`${report.contracts.investmentManager.dependencies.assetRegistry}\`\n`;
  markdown += `  - ProfitPool: \`${report.contracts.investmentManager.dependencies.profitPool}\`\n\n`;
  
  // 权限信息
  markdown += `## 权限信息\n\n`;
  for (const permission of report.permissions) {
    markdown += `- **${permission.contract}** (\`${permission.address}\`) 授予 **${permission.grantee}** (\`${permission.granteeAddress}\`) 角色: **${permission.role}**\n`;
  }
  markdown += `\n`;
  
  // 角色详情
  markdown += `## 角色详情\n\n`;
  
  // SystemParameters角色
  markdown += `### SystemParameters角色\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.systemParameters.ADMIN_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.systemParameters.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**DEFAULT_ADMIN_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.systemParameters.DEFAULT_ADMIN_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.systemParameters.DEFAULT_ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // AssetRegistry角色
  markdown += `### AssetRegistry角色\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.assetRegistry.ADMIN_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.assetRegistry.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**OPERATOR_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.assetRegistry.OPERATOR_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.assetRegistry.OPERATOR_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // ProfitPool角色
  markdown += `### ProfitPool角色\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.profitPool.ADMIN_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.profitPool.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  markdown += `**OPERATOR_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.profitPool.OPERATOR_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.profitPool.OPERATOR_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  // InvestmentManager角色
  markdown += `### InvestmentManager角色\n\n`;
  markdown += `**ADMIN_ROLE**:\n\n`;
  markdown += `- 成员数量: ${report.roles.investmentManager.ADMIN_ROLE.count}\n`;
  markdown += `- 成员: ${report.roles.investmentManager.ADMIN_ROLE.members.map(m => `\`${m}\``).join(', ')}\n\n`;
  
  return markdown;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 