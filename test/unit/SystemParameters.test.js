const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("SystemParameters", function () {
  let systemParameters;
  let owner;
  let admin;
  let user;
  
  // Constants
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  // Preset parameters
  const minInvestmentAmount = ethers.parseEther("10"); // 10 weUSD
  const maxInvestmentAmount = ethers.parseEther("100000000"); // 100M weUSD
  const period1Day = 86400; // 1 day (seconds)
  const period1Week = 604800; // 1 week (seconds)
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
      // Grant admin role
      await systemParameters.grantRole(ADMIN_ROLE, admin.address);
      expect(await systemParameters.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
      
      // New admin should be able to set parameters
      await systemParameters.connect(admin).setMinInvestmentAmount(ethers.parseEther("20"));
      expect(await systemParameters.getMinInvestmentAmount()).to.equal(ethers.parseEther("20"));

      // Revoke admin role
      await systemParameters.revokeRole(ADMIN_ROLE, admin.address);
      expect(await systemParameters.hasRole(ADMIN_ROLE, admin.address)).to.be.false;
      
      // Should not be able to set parameters after role revocation
      await expect(
        systemParameters.connect(admin).setMinInvestmentAmount(ethers.parseEther("30"))
      ).to.be.revertedWith("SystemParameters: caller is not an admin");
    });
  });

  describe("Pause and Unpause", function () {
    it("Should allow admin to pause and unpause the contract", async function () {
      // Pause contract
      await systemParameters.pause();
      expect(await systemParameters.paused()).to.be.true;
      
      // Unpause contract
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