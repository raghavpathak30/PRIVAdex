require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "hardhat",
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
