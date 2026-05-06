import { useCallback } from 'react';
import { ethers } from 'ethers';
import type { BrowserProvider } from 'ethers';

// This hook dynamically loads the fhEVM relayer SDK if available, and attempts
// to read the matcher deployment artifact. If the SDK or deployment JSON is
// missing, functions will throw informative errors so the developer can install
// or deploy first.

async function loadDeployment() {
  const candidatePaths = [
    '/deployments/sepolia/PrivaDEXMatcher.json',
    '/deployments/sepolia/DarkPoolMatcher.json',
  ];

  for (const deployPath of candidatePaths) {
    const response = await fetch(deployPath, { cache: 'no-store' });
    if (!response.ok) {
      continue;
    }

    const dep = await response.json();
    return dep;
  }

  throw new Error('Matcher deployment artifact not found at /deployments/sepolia/PrivaDEXMatcher.json or /deployments/sepolia/DarkPoolMatcher.json.');
}

async function loadRelayerSdk() {
  try {
    // Try the preferred relayer SDK import
    const mod = await import('@zama-fhe/relayer-sdk/web');
    return mod;
  } catch (e) {
    throw new Error("Relayer SDK '@zama-fhe/relayer-sdk' not found. Install it in frontend dependencies before using encrypted input flows.");
  }
}

export function useDarkPool() {
  const submitOrder = useCallback(async (price: bigint, qty: bigint, orderId: string) => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('No injected wallet found (MetaMask required)');
    }

    const deployment = await loadDeployment();
    // Checksum contract address for relayer SDK compatibility
    const contractAddress = ethers.getAddress(deployment.address);
    const abi = deployment.abi;

    const sdk = await loadRelayerSdk();

    // Create provider/signer using the same BrowserProvider pattern used elsewhere
    const provider = new ethers.BrowserProvider((window as any).ethereum as any) as BrowserProvider;
    const accounts = await provider.send('eth_requestAccounts', []);
    const rawUserAddress = accounts[0];
    // Checksum the address because relayer SDK validator requires checksummed format
    const userAddress = ethers.getAddress(rawUserAddress);
    const signer = await provider.getSigner();

    const createInstance = sdk.createInstance;
    const SepoliaConfig = sdk.SepoliaConfigV2 || sdk.SepoliaConfig;

    if (!createInstance || !SepoliaConfig) {
      throw new Error("Relayer SDK does not expose 'createInstance' / 'SepoliaConfig' — check SDK version and API.");
    }

    if (typeof sdk.initSDK === 'function') {
      await sdk.initSDK();
    }

    const relayerUrl = typeof SepoliaConfig.relayerUrl === 'string' && SepoliaConfig.relayerUrl.endsWith('/v2')
      ? SepoliaConfig.relayerUrl
      : `${String(SepoliaConfig.relayerUrl || 'https://relayer.testnet.zama.org').replace(/\/$/, '')}/v2`;

    const fhevm = await createInstance({
      ...SepoliaConfig,
      relayerUrl,
      network: (window as any).ethereum,
    });

    // Build encrypted input and submit
    const input = fhevm.createEncryptedInput(contractAddress, userAddress);
    // add64 is the expected API per builder patterns
    if (typeof input.add64 !== 'function' || typeof input.encrypt !== 'function') {
      throw new Error('Relayer SDK returned an input object with unexpected shape (missing add64/encrypt)');
    }

    input.add64(price);
    input.add64(qty);

    const encrypted = await input.encrypt();
    // encrypted should contain { handles, inputProof }
    const handles = encrypted.handles;
    const inputProof = encrypted.inputProof;
    if (!handles || !inputProof) {
      throw new Error('Encryption failed: missing handles or inputProof');
    }

    const contract = new ethers.Contract(contractAddress, abi, signer);
    const submitOrderFn = contract.interface.getFunction('submitOrder');
    const hasSeparatedProofSubmit = typeof (contract as any).submitOrder === 'function'
      && submitOrderFn !== null
      && submitOrderFn.inputs.length === 6;

    const tx = hasSeparatedProofSubmit
      ? await contract.submitOrder(orderId, handles[0], handles[1], inputProof, inputProof, true)
      : await contract.submitOrder(orderId, handles[0], handles[1], inputProof);
    await tx.wait();
    return tx;
  }, []);

  const tryMatch = useCallback(async (bidId: string, askId: string) => {
    const deployment = await loadDeployment();
    const contractAddress = deployment.address;
    const abi = deployment.abi;
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('No injected wallet found (MetaMask required)');
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum as any) as BrowserProvider;
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = typeof (contract as any).matchOrders === 'function'
      ? await contract.matchOrders(bidId, askId)
      : await contract.tryMatch(bidId, askId);
    await tx.wait();
    return tx;
  }, []);

  const requestDecryption = useCallback(async (requestId: string) => {
    const deployment = await loadDeployment();
    const contractAddress = deployment.address;
    const abi = deployment.abi;
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('No injected wallet found (MetaMask required)');
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum as any) as BrowserProvider;
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = typeof (contract as any).requestPublicDecryption === 'function'
      ? await contract.requestPublicDecryption(requestId)
      : await contract.requestDecryption(requestId);
    await tx.wait();
    return tx;
  }, []);

  return { submitOrder, tryMatch, requestDecryption };
}

export default useDarkPool;
