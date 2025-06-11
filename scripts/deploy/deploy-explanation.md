# 部署脚本错误原因及修复方案

## 问题分析

原部署脚本中的错误发生在以下行:
```javascript
await profitPool.depositProfit(ethers.parseEther("10000"));
```

通过检查合约代码发现，`depositProfit` 函数已经被注释/删除了，现在 `ProfitPool` 合约已经不再支持向通用池子中存入利润，而是要求向指定资产的池子中存入利润。

在 `ProfitPool.sol` 合约中可以看到：
```solidity
// function depositProfit(uint256 amount) external override nonReentrant {
//     require(amount > 0, "ProfitPool: amount must be greater than 0");
//     
//     // Update statistics
//     _totalDeposited += amount;
//     
//     // Transfer tokens to contract
//     IERC20(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
//     
//     emit ProfitDeposited(msg.sender, amount);
// }
```

这个函数已被注释掉，取而代之的是特定资产的利润池函数 `depositProfitForAsset`：
```solidity
function depositProfitForAsset(uint256 assetId, uint256 amount) 
    external 
    override 
    nonReentrant 
    assetExists(assetId) 
{
    require(amount > 0, "ProfitPool: amount must be greater than 0");
    
    // Update asset profit pool balance
    _assetProfitPools[assetId] += amount;
    
    // Update statistics
    _totalDeposited += amount;
    
    // Transfer tokens to contract
    IERC20(_systemParameters.getPlatformToken()).safeTransferFrom(msg.sender, address(this), amount);
    
    emit ProfitDepositedForAsset(msg.sender, assetId, amount);
}
```

## 修复方案

修复后的部署脚本 `deploy-fixed.js` 解决了这个问题：

1. 不再使用已删除的 `depositProfit` 函数，改为使用 `depositProfitForAsset` 函数
2. 明确地保存和使用资产ID，确保能够正确地向特定资产的利润池存入资金
3. 资金被分割到两个资产的利润池中（每个资产各5000 weUSD），而不是放在一个通用池中
4. 添加了额外的错误处理和日志记录，使脚本更加健壮

关键修改代码：
```javascript
let asset1Id, asset2Id;
// ... 创建资产后保存ID ...
asset1Id = asset1Receipt.logs[0].args[0];
console.log(`Added asset 1 with ID: ${asset1Id}`);

// ... 向特定资产池存入资金 ...
if (asset1Id) {
  // 向资产1的利润池中存入资金
  await weUSD.mint(deployer.address, ethers.parseEther("5000")); 
  await weUSD.approve(await profitPool.getAddress(), ethers.parseEther("5000"));
  await profitPool.depositProfitForAsset(asset1Id, ethers.parseEther("5000"));
  console.log(`Deposited 5,000 weUSD to profit pool for asset ID ${asset1Id}`);
}
```

## 使用方法

1. 确保已创建 `.env` 文件，包含必要的环境变量（可参考 `.env.example`）
2. 运行修复后的部署脚本：
```bash
npx hardhat run scripts/deploy/deploy-fixed.js --network testNet
```

3. 脚本执行完成后，将生成部署报告和 `.env.contracts` 文件，包含所有已部署合约的地址

## 总结

系统架构已从通用利润池模式变更为资产特定利润池模式，部署脚本需要适应这种变化。现在每个资产都有自己的利润池，投资收益将从特定资产的利润池中支付，而不是从通用池中支付。 