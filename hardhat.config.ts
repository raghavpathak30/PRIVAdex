import '@nomicfoundation/hardhat-toolbox';
import '@fhevm/hardhat-plugin';
import 'hardhat-deploy';
import { HardhatUserConfig } from 'hardhat/config';

// Helper to read vars from hardhat-vars plugin if available, falling back to env
function getVar(name: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hh = require('hardhat');
    if (hh && hh.vars && typeof hh.vars.get === 'function') {
      return hh.vars.get(name);
    }
  } catch (e) {
    // ignore
  }
  return process.env[name];
}

const ALCHEMY_KEY = getVar('ALCHEMY_API_KEY');
const PRIVATE_KEY = getVar('PRIVATE_KEY');

const config: HardhatUserConfig = {
  solidity: '0.8.26',
  networks: {
    sepolia: {
      url: ALCHEMY_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : 'https://eth-sepolia.g.alchemy.com/v2/',
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  paths: {
    deployments: 'deployments',
  },
};

export default config;
