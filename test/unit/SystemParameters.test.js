const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("SystemParameters", function () {
  let systemParameters;
  let owner;
  let admin;
  let user;
  
  // 常量
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  // 预设参数
  const minInvestmentAmount = ethers.parseEther("10"); // 10 weUSD
  const maxInvestmentAmount = ethers.parseEther("100000000"); // 1亿 weUSD
  const period1Day = 86400; // 1天（秒）
  const period1Week = 604800; // 1周（秒）
  const apy = ethers.parseEther("0.05"); // 5%

  beforeEach(async function () {
    [owner, admin, user] = await ethers.getSigners();

    const SystemParameters = await ethers.getContractFactory("SystemParameters");
    systemParameters = await upgrades.deployProxy(SystemParameters, [owner.address]);
    await systemParameters.waitForDeployment();
  });

  describe("Initialization", function () {
    it("Should set the correct roles", async function () {
      expect(await systemParameters.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await systemParameters.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should set default parameters", async function () {
      expect(await systemParameters.getMinInvestmentAmount()).to.equal(minInvestmentAmount);
      expect(await systemParameters.getMaxInvestmentAmount()).to.equal(maxInvestmentAmount);
      expect(await systemParameters.getPeriodAPY(period1Day)).to.be.gt(0);
      expect(await systemParameters.getPeriodAPY(period1Week)).to.be.gt(0);
    });
  });

  describe("Parameter Management", function () {
    it("Should allow admin to set min investment amount", async function () {
      const newMinAmount = ethers.parseEther("20");
      await systemParameters.setMinInvestmentAmount(newMinAmount);
      expect(await systemParameters.getMinInvestmentAmount()).to.equal(newMinAmount);
    });

    it("Should allow admin to set max investment amount", async function () {
      const newMaxAmount = ethers.parseEther("200000000");
      await systemParameters.setMaxInvestmentAmount(newMaxAmount);
      expect(await systemParameters.getMaxInvestmentAmount()).to.equal(newMaxAmount);
    });

    it("Should allow admin to set period APY", async function () {
      const newAPY = ethers.parseEther("0.06"); // 6%
      await systemParameters.setPeriodAPY(period1Day, newAPY);
      expect(await systemParameters.getPeriodAPY(period1Day)).to.equal(newAPY);
    });

    it("Should prevent non-admin from setting parameters", async function () {
      await expect(
        systemParameters.connect(user).setMinInvestmentAmount(ethers.parseEther("20"))
      ).to.be.revertedWith("SystemParameters: caller is not an admin");

      await expect(
        systemParameters.connect(user).setMaxInvestmentAmount(ethers.parseEther("200000000"))
      ).to.be.revertedWith("SystemParameters: caller is not an admin");

      await expect(
        systemParameters.connect(user).setPeriodAPY(period1Day, ethers.parseEther("0.06"))
      ).to.be.revertedWith("SystemParameters: caller is not an admin");
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant and revoke roles", async function () {
      // 授予管理员角色
      await systemParameters.grantRole(ADMIN_ROLE, admin.address);
      expect(await systemParameters.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      
      // 新管理员应该能设置参数
      await systemParameters.connect(admin).setMinInvestmentAmount(ethers.parseEther("20"));
      expect(await systemParameters.getMinInvestmentAmount()).to.equal(ethers.parseEther("20"));

      // 撤销管理员角色
      await systemParameters.revokeRole(ADMIN_ROLE, admin.address);
      expect(await systemParameters.hasRole(ADMIN_ROLE, admin.address)).to.be.false;
      
      // 被撤销角色后应该不能设置参数
      await expect(
        systemParameters.connect(admin).setMinInvestmentAmount(ethers.parseEther("30"))
      ).to.be.revertedWith("SystemParameters: caller is not an admin");
    });
  });

  describe("Pause and Unpause", function () {
    it("Should allow admin to pause and unpause the contract", async function () {
      // 暂停合约
      await systemParameters.pause();
      expect(await systemParameters.paused()).to.be.true;
      
      // 解除暂停
      await systemParameters.unpause();
      expect(await systemParameters.paused()).to.be.false;
    });
    
    it("Should prevent non-admin from pausing and unpausing", async function () {
      await expect(
        systemParameters.connect(user).pause()
      ).to.be.revertedWith("SystemParameters: caller is not an admin");
      
      await systemParameters.pause();
      
      await expect(
        systemParameters.connect(user).unpause()
      ).to.be.revertedWith("SystemParameters: caller is not an admin");
    });
  });
}); 