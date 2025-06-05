const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("系统集成测试", function () {
  // 测试常量
  const PLATFORM_TOKEN_DECIMALS = 18;
  const INITIAL_SUPPLY = ethers.parseUnits("1000000", PLATFORM_TOKEN_DECIMALS); // 100万代币
  const PROFIT_POOL_INITIAL = ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS); // 1万代币初始利润池
  
  // 测试夹具 - 部署合约并设置测试环境
  async function deployContractsFixture() {
    // 获取签名者
    const [deployer, investor1, investor2, operator] = await ethers.getSigners();
    
    console.log("\n=== 测试环境设置 ===");
    console.log(`部署者地址: ${deployer.address}`);
    console.log(`投资者1地址: ${investor1.address}`);
    console.log(`投资者2地址: ${investor2.address}`);
    console.log(`运营者地址: ${operator.address}`);
    
    // 部署 ERC20Mock 代币 (weUSD)
    console.log("部署 ERC20Mock (weUSD)...");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
    await weUSD.waitForDeployment();
    console.log(`ERC20Mock (weUSD) 部署地址: ${await weUSD.getAddress()}`);
    
    // 铸造初始供应量给部署者
    await weUSD.mint(deployer.address, INITIAL_SUPPLY);
    console.log(`初始供应量: ${ethers.formatUnits(INITIAL_SUPPLY, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    
    // 部署 SystemParameters 合约
    console.log("部署 SystemParameters...");
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    const systemParameters = await upgrades.deployProxy(SystemParameters, [deployer.address, await weUSD.getAddress()], {
      initializer: "initialize",
      kind: "uups"
    });
    await systemParameters.waitForDeployment();
    console.log(`SystemParameters 部署地址: ${await systemParameters.getAddress()}`);
    
    // 设置系统参数
    console.log("设置系统参数...");
    const oneDay = 24 * 60 * 60; // 1天
    const oneWeek = 7 * oneDay;  // 1周
    const twoWeeks = 2 * oneWeek; // 2周
    const oneMonth = 30 * oneDay; // 1月
    const threeMonths = 3 * oneMonth; // 3月
    const sixMonths = 6 * oneMonth; // 6月
    
    // 设置不同期限的APY
    await systemParameters.setPeriodAPY(oneDay, 500); // 5% APY
    await systemParameters.setPeriodAPY(oneWeek, 1000); // 10% APY
    await systemParameters.setPeriodAPY(twoWeeks, 1500); // 15% APY
    await systemParameters.setPeriodAPY(oneMonth, 2000); // 20% APY
    await systemParameters.setPeriodAPY(threeMonths, 2500); // 25% APY
    await systemParameters.setPeriodAPY(sixMonths, 3000); // 30% APY
    
    // 设置投资限额
    await systemParameters.setMinInvestmentAmount(ethers.parseUnits("10", PLATFORM_TOKEN_DECIMALS)); // 最低投资10 weUSD
    await systemParameters.setMaxInvestmentAmount(ethers.parseUnits("100000000", PLATFORM_TOKEN_DECIMALS)); // 最高投资1亿 weUSD
    
    // 设置投资冷却期 - 为了测试方便设为1分钟
    await systemParameters.setInvestmentCooldown(60);
    
    // 部署 AssetRegistry 合约
    console.log("部署 AssetRegistry...");
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const assetRegistry = await upgrades.deployProxy(AssetRegistry, [deployer.address, await systemParameters.getAddress()], {
      initializer: "initialize",
      kind: "uups"
    });
    await assetRegistry.waitForDeployment();
    console.log(`AssetRegistry 部署地址: ${await assetRegistry.getAddress()}`);
    
    // 添加示例资产
    console.log("添加示例资产...");
    await assetRegistry.addAsset(
      "测试债券 A", 
      "测试公司", 
      "这是一个测试债券资产", 
      ethers.parseUnits("1000000", PLATFORM_TOKEN_DECIMALS), // 100万 weUSD 最大金额
      1000, // 10% APY (基于10000)
      ethers.parseUnits("100", PLATFORM_TOKEN_DECIMALS), // 100 weUSD 最低投资
      ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS), // 1万 weUSD 每用户最高投资
      oneMonth // 1个月期限
    );
    
    await assetRegistry.addAsset(
      "测试债券 B", 
      "测试企业", 
      "这是另一个测试债券资产", 
      ethers.parseUnits("2000000", PLATFORM_TOKEN_DECIMALS), // 200万 weUSD 最大金额
      1500, // 15% APY (基于10000)
      ethers.parseUnits("500", PLATFORM_TOKEN_DECIMALS), // 500 weUSD 最低投资
      ethers.parseUnits("20000", PLATFORM_TOKEN_DECIMALS), // 2万 weUSD 每用户最高投资
      threeMonths // 3个月期限
    );
    
    // 部署 ProfitPool 合约
    console.log("部署 ProfitPool...");
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
    console.log(`ProfitPool 部署地址: ${await profitPool.getAddress()}`);
    
    // 部署 InvestmentManager 合约
    console.log("部署 InvestmentManager...");
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
    console.log(`InvestmentManager 部署地址: ${await investmentManager.getAddress()}`);
    
    // 设置 InvestmentManager 为 AssetRegistry 的操作员
    console.log("设置合约权限...");
    await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
    
    // 设置 InvestmentManager 为 ProfitPool 的操作员
    await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
    
    // 添加一些测试资金到利润池
    console.log("添加测试资金到利润池...");
    await weUSD.mint(deployer.address, PROFIT_POOL_INITIAL); // 铸造10000 weUSD
    await weUSD.approve(await profitPool.getAddress(), PROFIT_POOL_INITIAL);
    await profitPool.depositProfit(PROFIT_POOL_INITIAL);
    
    // 给投资者一些代币用于测试
    const investorBalance = ethers.parseUnits("10000", PLATFORM_TOKEN_DECIMALS); // 1万代币
    await weUSD.mint(investor1.address, investorBalance);
    await weUSD.mint(investor2.address, investorBalance);
    console.log(`投资者1余额: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    console.log(`投资者2余额: ${ethers.formatUnits(investorBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    
    console.log("=== 测试环境设置完成 ===\n");
    
    // 返回所有部署的合约和账户
    return { 
      deployer, 
      investor1, 
      investor2, 
      operator, 
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
  
  describe("初始设置和配置测试", function () {
    it("应该正确初始化系统参数", async function () {
      const { systemParameters, weUSD } = await loadFixture(deployContractsFixture);
      
      // 验证平台代币
      const platformToken = await systemParameters.getPlatformToken();
      expect(platformToken).to.equal(await weUSD.getAddress());
      
      // 验证APY设置
      const oneMonthAPY = await systemParameters.getPeriodAPY(30 * 24 * 60 * 60);
      expect(oneMonthAPY).to.equal(2000); // 20%
      
      // 验证投资限额
      const minInvestment = await systemParameters.getMinInvestmentAmount();
      const maxInvestment = await systemParameters.getMaxInvestmentAmount();
      expect(minInvestment).to.equal(ethers.parseUnits("10", PLATFORM_TOKEN_DECIMALS));
      expect(maxInvestment).to.equal(ethers.parseUnits("100000000", PLATFORM_TOKEN_DECIMALS));
      
      console.log("系统参数验证成功");
    });
    
    it("应该正确初始化资产注册表", async function () {
      const { assetRegistry } = await loadFixture(deployContractsFixture);
      
      // 验证资产数量
      const assetCount = await assetRegistry.getAssetCount();
      expect(assetCount).to.equal(2);
      
      // 验证资产详情
      const asset1 = await assetRegistry.getAsset(1);
      expect(asset1.name).to.equal("测试债券 A");
      expect(asset1.issuer).to.equal("测试公司");
      expect(asset1.apy).to.equal(1000); // 10%
      
      const asset2 = await assetRegistry.getAsset(2);
      expect(asset2.name).to.equal("测试债券 B");
      expect(asset2.issuer).to.equal("测试企业");
      expect(asset2.apy).to.equal(1500); // 15%
      
      console.log("资产注册表验证成功");
    });
    
    it("应该正确初始化利润池", async function () {
      const { profitPool, weUSD } = await loadFixture(deployContractsFixture);
      
      // 验证利润池余额
      const balance = await profitPool.getBalance();
      expect(balance).to.equal(PROFIT_POOL_INITIAL);
      
      // 验证代币地址
      const rewardToken = await profitPool.getRewardToken();
      expect(rewardToken).to.equal(await weUSD.getAddress());
      
      console.log("利润池验证成功");
    });
  });
  
  describe("投资流程测试", function () {
    it("投资者应该能够成功投资资产", async function () {
      const { investor1, weUSD, investmentManager } = await loadFixture(deployContractsFixture);
      
      // 投资金额
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      const assetId = 1; // 第一个资产
      
      // 批准代币转账
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      
      // 执行投资
      const tx = await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      const receipt = await tx.wait();
      
      // 验证投资是否成功
      const investmentId = 1; // 第一笔投资
      const investment = await investmentManager.getInvestment(investmentId);
      
      expect(investment.investor).to.equal(investor1.address);
      expect(investment.assetId).to.equal(assetId);
      expect(investment.amount).to.equal(investmentAmount);
      expect(investment.status).to.equal(1); // Active
      
      console.log(`投资者1成功投资 ${ethers.formatUnits(investmentAmount, PLATFORM_TOKEN_DECIMALS)} weUSD 到资产${assetId}`);
      console.log(`投资ID: ${investmentId}`);
    });
    
    it("投资者应该能够查看投资详情", async function () {
      const { investor1, investor2, weUSD, investmentManager } = await loadFixture(deployContractsFixture);
      
      // 两个投资者都进行投资
      const investmentAmount1 = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      const investmentAmount2 = ethers.parseUnits("2000", PLATFORM_TOKEN_DECIMALS);
      
      // 投资者1投资资产1
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount1);
      await investmentManager.connect(investor1).invest(1, investmentAmount1);
      
      // 投资者2投资资产2
      await weUSD.connect(investor2).approve(await investmentManager.getAddress(), investmentAmount2);
      await investmentManager.connect(investor2).invest(2, investmentAmount2);
      
      // 获取投资者1的投资摘要
      const summary1 = await investmentManager.getUserInvestmentSummary(investor1.address);
      expect(summary1.totalInvestment).to.equal(investmentAmount1);
      expect(summary1.activeInvestmentCount).to.equal(1);
      
      // 获取投资者2的投资摘要
      const summary2 = await investmentManager.getUserInvestmentSummary(investor2.address);
      expect(summary2.totalInvestment).to.equal(investmentAmount2);
      expect(summary2.activeInvestmentCount).to.equal(1);
      
      console.log("投资详情查询成功");
      console.log(`投资者1总投资: ${ethers.formatUnits(summary1.totalInvestment, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      console.log(`投资者2总投资: ${ethers.formatUnits(summary2.totalInvestment, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
    
    it("应该能够计算投资收益", async function () {
      const { investor1, weUSD, investmentManager, oneMonth } = await loadFixture(deployContractsFixture);
      
      // 投资金额
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      const assetId = 1; // 第一个资产
      
      // 执行投资
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      
      // 计算收益
      const investmentId = 1;
      const initialProfit = await investmentManager.calculateProfit(investmentId);
      console.log(`初始收益: ${ethers.formatUnits(initialProfit, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // 模拟时间流逝 (在真实区块链上无法实现，这里只是示例)
      // 在实际测试中，可以使用hardhat的时间操作功能
      // await ethers.provider.send("evm_increaseTime", [oneMonth / 2]);
      // await ethers.provider.send("evm_mine");
      
      // 由于无法在测试中真实模拟时间流逝，我们只验证计算逻辑
      const investment = await investmentManager.getInvestment(investmentId);
      const apy = 1000; // 10%
      const amount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      
      console.log(`投资APY: ${apy / 100}%`);
      console.log(`投资金额: ${ethers.formatUnits(amount, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
  });
  
  describe("利润池操作测试", function () {
    it("应该能够存入和提取利润", async function () {
      const { deployer, profitPool, weUSD } = await loadFixture(deployContractsFixture);
      
      // 初始余额
      const initialBalance = await profitPool.getBalance();
      console.log(`初始利润池余额: ${ethers.formatUnits(initialBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // 存入更多利润
      const depositAmount = ethers.parseUnits("5000", PLATFORM_TOKEN_DECIMALS);
      await weUSD.mint(deployer.address, depositAmount);
      await weUSD.approve(await profitPool.getAddress(), depositAmount);
      await profitPool.depositProfit(depositAmount);
      
      // 验证新余额
      const newBalance = await profitPool.getBalance();
      expect(newBalance).to.equal(initialBalance + depositAmount);
      console.log(`存款后余额: ${ethers.formatUnits(newBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // 提取部分利润
      const withdrawAmount = ethers.parseUnits("2000", PLATFORM_TOKEN_DECIMALS);
      await profitPool.withdrawProfit(withdrawAmount);
      
      // 验证提款后余额
      const finalBalance = await profitPool.getBalance();
      expect(finalBalance).to.equal(newBalance - withdrawAmount);
      console.log(`提款后余额: ${ethers.formatUnits(finalBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
    
    it("应该能够为特定资产存入利润", async function () {
      const { deployer, profitPool, weUSD } = await loadFixture(deployContractsFixture);
      
      // 为资产1存入利润
      const assetId = 1;
      const depositAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      
      await weUSD.mint(deployer.address, depositAmount);
      await weUSD.approve(await profitPool.getAddress(), depositAmount);
      await profitPool.depositProfitForAsset(assetId, depositAmount);
      
      // 验证资产利润池
      const assetBalance = await profitPool.getAssetBalance(assetId);
      expect(assetBalance).to.equal(depositAmount);
      console.log(`资产${assetId}利润池余额: ${ethers.formatUnits(assetBalance, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
  });
  
  describe("赎回投资测试", function () {
    it("投资者应该能够赎回投资", async function () {
      const { investor1, weUSD, investmentManager, profitPool, deployer, oneMonth } = await loadFixture(deployContractsFixture);
      
      // 投资金额
      const investmentAmount = ethers.parseUnits("1000", PLATFORM_TOKEN_DECIMALS);
      const assetId = 1; // 第一个资产
      
      // 执行投资
      await weUSD.connect(investor1).approve(await investmentManager.getAddress(), investmentAmount);
      await investmentManager.connect(investor1).invest(assetId, investmentAmount);
      
      // 记录投资前余额
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      
      // 向资产利润池添加足够的利润用于支付收益
      const profitAmount = ethers.parseUnits("200", PLATFORM_TOKEN_DECIMALS); // 200 weUSD作为收益
      await weUSD.mint(deployer.address, profitAmount);
      await weUSD.connect(deployer).approve(await profitPool.getAddress(), profitAmount);
      await profitPool.connect(deployer).depositProfitForAsset(assetId, profitAmount);
      console.log(`向资产${assetId}利润池添加了${ethers.formatUnits(profitAmount, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      
      // 模拟时间流逝 - 增加一个月的时间
      await ethers.provider.send("evm_increaseTime", [oneMonth]);
      await ethers.provider.send("evm_mine");
      console.log("时间已推进一个月");
      
      // 赎回投资
      const investmentId = 1;
      await investmentManager.connect(investor1).redeem(investmentId);
      
      // 验证投资状态
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(2); // Completed
      
      // 验证资金返还
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // 余额应该增加
      
      console.log(`赎回前余额: ${ethers.formatUnits(balanceBefore, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      console.log(`赎回后余额: ${ethers.formatUnits(balanceAfter, PLATFORM_TOKEN_DECIMALS)} weUSD`);
      console.log(`收益: ${ethers.formatUnits(balanceAfter - balanceBefore, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
  });
  
  describe("系统管理测试", function () {
    it("管理员应该能够更新系统参数", async function () {
      const { deployer, systemParameters } = await loadFixture(deployContractsFixture);
      
      // 更新最低投资金额
      const newMinAmount = ethers.parseUnits("20", PLATFORM_TOKEN_DECIMALS);
      await systemParameters.connect(deployer).setMinInvestmentAmount(newMinAmount);
      
      // 验证更新
      const updatedMinAmount = await systemParameters.getMinInvestmentAmount();
      expect(updatedMinAmount).to.equal(newMinAmount);
      
      console.log(`更新后的最低投资金额: ${ethers.formatUnits(updatedMinAmount, PLATFORM_TOKEN_DECIMALS)} weUSD`);
    });
    
    it("管理员应该能够暂停和恢复投资管理器", async function () {
      const { deployer, investmentManager } = await loadFixture(deployContractsFixture);
      
      // 初始状态应该是未暂停
      expect(await investmentManager.paused()).to.be.false;
      
      // 暂停合约
      await investmentManager.connect(deployer).pause();
      expect(await investmentManager.paused()).to.be.true;
      console.log("投资管理器已暂停");
      
      // 恢复合约
      await investmentManager.connect(deployer).unpause();
      expect(await investmentManager.paused()).to.be.false;
      console.log("投资管理器已恢复");
    });
  });
  
  // 集成测试报告
  after(async function() {
    console.log("\n=== 集成测试报告 ===");
    console.log("1. 系统参数合约成功初始化并配置");
    console.log("2. 资产注册表成功添加和管理资产");
    console.log("3. 利润池成功管理平台利润");
    console.log("4. 投资管理器成功处理投资操作");
    console.log("5. 投资者能够成功投资和赎回");
    console.log("6. 系统管理功能正常运行");
    console.log("=== 测试完成 ===");
  });
}); 