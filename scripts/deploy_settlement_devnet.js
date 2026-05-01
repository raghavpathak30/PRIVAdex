const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account available. Set DEPLOYER_PRIVATE_KEY.");
  }

  console.log("Deploying DarkPoolSettlement");
  console.log("Deployer:", deployer.address);
  console.log("Network:", hre.network.name);

  const factory = await hre.ethers.getContractFactory("DarkPoolSettlement");
  const contract = await factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("========================================");
  console.log("DarkPoolSettlement deployed address:", deployedAddress);
  console.log("authorizedSettler:", deployer.address);
  console.log("rpc:", process.env.ZAMA_DEVNET_RPC_URL || "https://devnet.zama.ai");
  console.log("Verify on Zama explorer: https://explorer.devnet.zama.ai");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
