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
  
  const oneDay = 24 * 60 * 60; // 1天
  const oneWeek = 7 * oneDay;  // 1周
  
  beforeEach(async function () {
    [owner, investor1, investor2] = await ethers.getSigners();
    
    // 部署 mock weUSD 代币
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    weUSD = await ERC20Mock.deploy("weUSD", "weUSD", 18);
    
    // 部署系统参数合约
    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    systemParameters = await upgrades.deployProxy(SystemParameters, [owner.address], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // 设置系统参数
    await systemParameters.setPeriodAPY(oneDay, ethers.parseEther("0.05")); // 5% APY
    await systemParameters.setPeriodAPY(oneWeek, ethers.parseEther("0.10")); // 10% APY
    await systemParameters.setMinInvestmentAmount(ethers.parseEther("10")); // 最小投资10 weUSD
    await systemParameters.setMaxInvestmentAmount(ethers.parseEther("100000000")); // 最大投资1亿 weUSD
    await systemParameters.setInvestmentCooldown(0); // 无冷却期，便于测试
    await systemParameters.setProfitPoolMinBalance(ethers.parseEther("100")); // 最低余额100 weUSD
    
    // 部署资产注册合约
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    assetRegistry = await upgrades.deployProxy(AssetRegistry, [owner.address], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // 添加测试资产
    await assetRegistry.addAsset(
      "测试债券", 
      "Test Bond", 
      "这是一个测试债券资产", 
      "Test Inc.",
      ethers.parseEther("1000000"), // 100万 weUSD
      "https://example.com/image.png"
    );
    
    // 部署收益池合约
    const ProfitPool = await ethers.getContractFactory("ProfitPool");
    profitPool = await upgrades.deployProxy(ProfitPool, [
      owner.address,
      await systemParameters.getAddress(),
      await weUSD.getAddress()
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    
    // 部署投资管理合约
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
    
    // 部署风险监控合约
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
    
    // 设置权限
    await assetRegistry.grantRole(await assetRegistry.OPERATOR_ROLE(), await investmentManager.getAddress());
    await profitPool.grantRole(await profitPool.OPERATOR_ROLE(), await investmentManager.getAddress());
    
    // 向收益池添加资金
    await weUSD.mint(owner.address, ethers.parseEther("10000"));
    await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("10000"));
    await profitPool.depositProfit(ethers.parseEther("10000"));
    
    // 给投资者铸造代币
    await weUSD.mint(investor1.address, ethers.parseEther("1000"));
    await weUSD.mint(investor2.address, ethers.parseEther("1000"));
    
    // 将投资者添加到白名单
    await investmentManager.addToWhitelist(investor1.address);
    await investmentManager.addToWhitelist(investor2.address);
  });
  
  describe("基本功能测试", function () {
    it("应该正确初始化合约", async function () {
      expect(await investmentManager.isWhitelisted(owner.address)).to.be.true;
      expect(await investmentManager.isWhitelisted(investor1.address)).to.be.true;
      expect(await investmentManager.isWhitelisted(investor2.address)).to.be.true;
      
      expect(await systemParameters.getPeriodAPY(oneDay)).to.equal(ethers.parseEther("0.05"));
      expect(await systemParameters.getPeriodAPY(oneWeek)).to.equal(ethers.parseEther("0.10"));
    });
    
    it("用户应该能够投资", async function () {
      // 投资者1批准代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1进行投资
      const tx = await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
      
      // 等待交易确认
      const receipt = await tx.wait();
      
      // 通过事件找到投资ID
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      expect(event).to.not.be.undefined;
      
      // 获取投资ID
      const investmentId = event.args[0];
      
      // 检查投资记录
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.investor).to.equal(investor1.address);
      expect(investment.amount).to.equal(ethers.parseEther("100"));
      expect(investment.period).to.equal(oneDay);
      expect(investment.status).to.equal(0); // Active
    });
    
    it("用户应该能够赎回投资", async function () {
      // 投资者1批准代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1进行投资
      const tx = await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
      
      // 等待交易确认
      const receipt = await tx.wait();
      
      // 通过事件找到投资ID
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      const investmentId = event.args[0];
      
      // 获取投资前的余额
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      
      // 时间快进1天
      await ethers.provider.send("evm_increaseTime", [oneDay]);
      await ethers.provider.send("evm_mine");
      
      // 赎回投资
      await investmentManager.connect(investor1).redeem(investmentId);
      
      // 获取投资后的余额
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      
      // 检查余额增加（本金 + 收益）
      expect(balanceAfter).to.be.gt(balanceBefore);
      
      // 检查投资状态
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(1); // Completed
    });
    
    it("风险监控应该正确检测异常投资", async function () {
      // 设置异常投资阈值为50 weUSD
      await riskMonitor.setUnusualInvestmentAmountThreshold(ethers.parseEther("50"));
      
      // 监控正常投资
      const normalResult = await riskMonitor.monitorInvestment(
        investor1.address,
        ethers.parseEther("40")
      );
      expect(normalResult).to.be.false;
      
      // 监控异常投资
      const unusualResult = await riskMonitor.monitorInvestment(
        investor1.address,
        ethers.parseEther("60")
      );
      expect(unusualResult).to.be.true;
    });
  });
  
  describe("安全机制测试", function () {
    it("应该正确处理黑名单", async function () {
      // 投资者1批准代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1进行投资
      await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
      
      // 将投资者1加入黑名单
      await investmentManager.addToBlacklist(investor1.address);
      expect(await investmentManager.isBlacklisted(investor1.address)).to.be.true;
      
      // 投资者1批准更多代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1尝试再次投资，应该失败
      await expect(
        investmentManager.connect(investor1).invest(
          1, // 资产ID
          ethers.parseEther("100"), // 100 weUSD
          oneDay // 1天周期
        )
      ).to.be.revertedWith("InvestmentManager: account is blacklisted");
      
      // 从黑名单移除投资者1
      await investmentManager.removeFromBlacklist(investor1.address);
      expect(await investmentManager.isBlacklisted(investor1.address)).to.be.false;
      
      // 投资者1应该能够再次投资
      await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
    });
    
    it("应该正确处理紧急取消", async function () {
      // 投资者1批准代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1进行投资
      const tx = await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
      
      // 等待交易确认
      const receipt = await tx.wait();
      
      // 通过事件找到投资ID
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "InvestmentCreated"
      );
      
      const investmentId = event.args[0];
      
      // 获取投资前的余额
      const balanceBefore = await weUSD.balanceOf(investor1.address);
      
      // 管理员紧急取消投资
      await investmentManager.emergencyCancel(investmentId);
      
      // 获取投资后的余额
      const balanceAfter = await weUSD.balanceOf(investor1.address);
      
      // 检查余额增加（只返还本金，无收益）
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("100"));
      
      // 检查投资状态
      const investment = await investmentManager.getInvestment(investmentId);
      expect(investment.status).to.equal(2); // Cancelled
    });
    
    it("应该正确处理暂停机制", async function () {
      // 暂停合约
      await investmentManager.pause();
      
      // 投资者1批准代币
      await weUSD.connect(investor1).approve(
        await investmentManager.getAddress(),
        ethers.parseEther("100")
      );
      
      // 投资者1尝试投资，应该失败
      await expect(
        investmentManager.connect(investor1).invest(
          1, // 资产ID
          ethers.parseEther("100"), // 100 weUSD
          oneDay // 1天周期
        )
      ).to.be.revertedWith("Pausable: paused");
      
      // 解除暂停
      await investmentManager.unpause();
      
      // 投资者1应该能够投资
      await investmentManager.connect(investor1).invest(
        1, // 资产ID
        ethers.parseEther("100"), // 100 weUSD
        oneDay // 1天周期
      );
    });
  });
}); 