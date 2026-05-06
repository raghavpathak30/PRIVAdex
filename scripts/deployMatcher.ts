import fs from 'fs';
import path from 'path';
import { ethers, artifacts, network } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying DarkPoolMatcher with', deployer.address, 'on', network.name);

  const artifact = await artifacts.readArtifact('DarkPoolMatcher');
  const DarkPoolMatcher = await ethers.getContractFactory('DarkPoolMatcher');
  const deployed = await DarkPoolMatcher.connect(deployer).deploy();
  await deployed.deploymentTransaction();
  await deployed.waitForDeployment();

  console.log('DarkPoolMatcher deployed to', deployed.target || deployed.address);

  const repoRoot = path.resolve(process.cwd(), '..');
  const deploymentsDir = path.join(repoRoot, 'deployments', network.name);
  const frontendDeploymentsDir = path.join(repoRoot, 'frontend', 'public', 'deployments', network.name);
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.mkdirSync(frontendDeploymentsDir, { recursive: true });

  const out = {
    address: deployed.target || deployed.address,
    abi: artifact.abi,
    blockNumber: (await ethers.provider.getBlockNumber()),
    network: network.name,
  };

  const outPath = path.join(deploymentsDir, 'DarkPoolMatcher.json');
  const frontendOutPath = path.join(frontendDeploymentsDir, 'DarkPoolMatcher.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(frontendOutPath, JSON.stringify(out, null, 2));
  console.log('Wrote deployment artifact to', outPath);
  console.log('Copied deployment artifact to', frontendOutPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
