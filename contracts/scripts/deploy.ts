import 'dotenv/config';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log('Deployer address:', deployerAddress);

  const Factory = await ethers.getContractFactory('DarkPoolSettlement');
  const deployTx = Factory.getDeployTransaction(deployerAddress);

  try {
    const estimatedGas = await deployer.estimateGas(deployTx);
    console.log('Estimated gas before deploy:', estimatedGas.toString());
  } catch (err) {
    console.warn('Gas estimation failed:', err);
  }

  const contract = await Factory.deploy(deployerAddress);
  await contract.waitForDeployment();

  // v6 compatibility: contract.target is the deployed address alias
  const deployedAddress = (contract as any).target || (contract as any).address || contract.address;
  console.log('Deployed DarkPoolSettlement at:', deployedAddress);
  console.log(`Sepolia Etherscan: https://sepolia.etherscan.io/address/${deployedAddress}`);

  const out = {
    DarkPoolSettlement: deployedAddress,
    network: 'sepolia',
    deployedAt: new Date().toISOString()
  };

  const outPath = path.join(__dirname, '..', 'deployment.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote deployment JSON to', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
