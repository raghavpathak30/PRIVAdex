const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  console.log("🚀 Deploying PrivaDEXMatcher to Sepolia...\n");

  // Get deployer signer
  const [deployer] = await hre.ethers.getSigners();
  console.log(`📝 Deployer: ${deployer.address}`);
  console.log(`📡 Network: ${hre.network.name}\n`);

  // Deploy PrivaDEXMatcher
  const PrivaDEXMatcher = await hre.ethers.getContractFactory("PrivaDEXMatcher");
  const matcher = await PrivaDEXMatcher.deploy();
  await matcher.deploymentTransaction();
  await matcher.waitForDeployment();

  const deployedAddress = await matcher.getAddress();
  console.log(`✅ PrivaDEXMatcher deployed to: ${deployedAddress}`);

  // Get block number
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  console.log(`📦 Block: ${blockNumber}\n`);

  // Read ABI
  const artifact = await hre.artifacts.readArtifact("PrivaDEXMatcher");
  const abi = artifact.abi;

  // Get current timestamp
  const block = await hre.ethers.provider.getBlock(blockNumber);
  const timestamp = block.timestamp;

  // Prepare deployment artifact
  const deploymentArtifact = {
    address: deployedAddress,
    abi: abi,
    blockNumber: blockNumber,
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: timestamp,
  };

  // Write to repo-level deployments directory
  const repoRoot = path.resolve(__dirname, "..");
  const deploymentsDir = path.join(repoRoot, "deployments", hre.network.name);
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const artifactPath = path.join(deploymentsDir, "PrivaDEXMatcher.json");
  fs.writeFileSync(artifactPath, JSON.stringify(deploymentArtifact, null, 2));
  console.log(`📄 Artifact written to: ${artifactPath}`);

  // Also write to frontend public directory for browser runtime fetch
  const frontendDir = path.join(repoRoot, "frontend", "public", "deployments", hre.network.name);
  fs.mkdirSync(frontendDir, { recursive: true });

  const frontendArtifactPath = path.join(frontendDir, "PrivaDEXMatcher.json");
  fs.writeFileSync(frontendArtifactPath, JSON.stringify(deploymentArtifact, null, 2));
  console.log(`📄 Artifact copied to: ${frontendArtifactPath}`);

  // Provide verification instructions
  console.log("\n" + "=".repeat(70));
  console.log("📋 VERIFICATION INSTRUCTIONS:");
  console.log("=".repeat(70));
  console.log(`To verify on Sepolia Etherscan:`);
  console.log(`https://sepolia.etherscan.io/address/${deployedAddress}#code`);
  console.log("\nImplement verification via:  npx hardhat verify --network sepolia <ADDRESS>");
  console.log("=".repeat(70) + "\n");

  console.log("✨ Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
