require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    zamaDevnet: {
      url: process.env.ZAMA_DEVNET_RPC_URL || "https://devnet.zama.ai",
      chainId: 9000,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache"
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 800 },
          evmVersion: "cancun"
        }
      },
      {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 800 },
          evmVersion: "cancun"
        }
      }
    ]
  }
};
