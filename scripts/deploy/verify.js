// Verification script
const { ethers, upgrades, run } = require("hardhat");

async function main() {
  console.log("Verifying contracts...");

  // Get deployed contract addresses
  const systemParametersAddress = process.env.SYSTEM_PARAMETERS_ADDRESS;
  const assetRegistryAddress = process.env.ASSET_REGISTRY_ADDRESS;
  const profitPoolAddress = process.env.PROFIT_POOL_ADDRESS;
  const investmentManagerAddress = process.env.INVESTMENT_MANAGER_ADDRESS;
  const weUSDAddress = process.env.WEUSD_ADDRESS;

  // Verify contract implementations
  console.log("Verifying SystemParameters implementation...");
  const systemParametersImplAddress = await upgrades.erc1967.getImplementationAddress(systemParametersAddress);
  await run("verify:verify", {
    address: systemParametersImplAddress
  });

  console.log("Verifying AssetRegistry implementation...");
  const assetRegistryImplAddress = await upgrades.erc1967.getImplementationAddress(assetRegistryAddress);
  await run("verify:verify", {
    address: assetRegistryImplAddress
  });

  console.log("Verifying ProfitPool implementation...");
  const profitPoolImplAddress = await upgrades.erc1967.getImplementationAddress(profitPoolAddress);
  await run("verify:verify", {
    address: profitPoolImplAddress
  });

  console.log("Verifying InvestmentManager implementation...");
  const investmentManagerImplAddress = await upgrades.erc1967.getImplementationAddress(investmentManagerAddress);
  await run("verify:verify", {
    address: investmentManagerImplAddress
  });

  // Verify weUSD token
  console.log("Verifying WeUSD token...");
  await run("verify:verify", {
    address: weUSDAddress,
    constructorArguments: ["Wrapped eUSD", "weUSD", 18]
  });

  console.log("Verification completed!");
}

// Run verification
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 