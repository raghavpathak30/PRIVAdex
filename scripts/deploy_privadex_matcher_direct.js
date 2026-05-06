const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  console.log("🚀 Deploying PrivaDEXMatcher to Sepolia (direct ethers)...\n");

  // Get environment variables
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/riUDz5ZMLWoKuEiIfWG5N";
  const privKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

  if (!privKey) {
    throw new Error("PRIVATE_KEY environment variable not set");
  }

  // Create provider and signer
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privKey, provider);

  console.log(`📝 Deployer: ${signer.address}`);
  console.log(`📡 Network: Sepolia`);
  console.log(`🌐 RPC: ${rpcUrl}\n`);

  // Read compiled contract
  const contractPath = path.join(__dirname, "..", "contracts", "artifacts", "contracts", "PrivaDEXMatcher.sol", "PrivaDEXMatcher.json");
  const contractArtifact = JSON.parse(fs.readFileSync(contractPath, "utf8"));

  // Deploy
  const factory = new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode, signer);
  console.log("⏳ Deploying contract...");
  const contract = await factory.deploy();
  const deploymentTx = contract.deploymentTransaction();
  console.log(`📤 Transaction hash: ${deploymentTx.hash}`);

  // Wait for deployment
  const receipt = await contract.deploymentTransaction().wait(1);
  const deployedAddress = receipt.contractAddress;

  console.log(`✅ PrivaDEXMatcher deployed to: ${deployedAddress}`);
  console.log(`📦 Block: ${receipt.blockNumber}`);
  console.log(`⛽ Gas used: ${receipt.gasUsed}\n`);

  // Get block details
  const block = await provider.getBlock(receipt.blockNumber);

  // Prepare deployment artifact
  const deploymentArtifact = {
    address: deployedAddress,
    abi: contractArtifact.abi,
    blockNumber: receipt.blockNumber,
    network: "sepolia",
    deployer: signer.address,
    timestamp: block.timestamp,
    transactionHash: deploymentTx.hash,
  };

  // Write to repo-level deployments directory
  const repoRoot = path.resolve(__dirname, "..");
  const deploymentsDir = path.join(repoRoot, "deployments", "sepolia");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const artifactPath = path.join(deploymentsDir, "PrivaDEXMatcher.json");
  fs.writeFileSync(artifactPath, JSON.stringify(deploymentArtifact, null, 2));
  console.log(`📄 Artifact written to: ${artifactPath}`);

  // Also write to frontend public directory
  const frontendDir = path.join(repoRoot, "frontend", "public", "deployments", "sepolia");
  fs.mkdirSync(frontendDir, { recursive: true });

  const frontendArtifactPath = path.join(frontendDir, "PrivaDEXMatcher.json");
  fs.writeFileSync(frontendArtifactPath, JSON.stringify(deploymentArtifact, null, 2));
  console.log(`📄 Artifact copied to: ${frontendArtifactPath}`);

  // Verification instructions
  console.log("\n" + "=".repeat(70));
  console.log("📋 DEPLOYMENT SUMMARY:");
  console.log("=".repeat(70));
  console.log(`Contract: PrivaDEXMatcher`);
  console.log(`Address:  ${deployedAddress}`);
  console.log(`Network:  Sepolia`);
  console.log(`Block:    ${receipt.blockNumber}`);
  console.log(`Hash:     ${deploymentTx.hash}`);
  console.log(`Deployer: ${signer.address}`);
  console.log("\n📋 VERIFICATION LINK:");
  console.log(`https://sepolia.etherscan.io/address/${deployedAddress}#code`);
  console.log("=".repeat(70) + "\n");

  console.log("✨ Deployment complete!");
  return deployedAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
