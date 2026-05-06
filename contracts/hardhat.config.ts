import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || '';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';
const DEPLOYER_PRIVATE_KEY_HEX = DEPLOYER_PRIVATE_KEY && DEPLOYER_PRIVATE_KEY.startsWith('0x')
  ? DEPLOYER_PRIVATE_KEY
  : DEPLOYER_PRIVATE_KEY
    ? `0x${DEPLOYER_PRIVATE_KEY}`
    : '';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.26'
      }
    ]
  },
  paths: {
    sources: './contracts'
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: DEPLOYER_PRIVATE_KEY_HEX ? [DEPLOYER_PRIVATE_KEY_HEX] : []
    }
  }
};

export default config;
