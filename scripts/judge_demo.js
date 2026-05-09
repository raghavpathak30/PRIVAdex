#!/usr/bin/env node
// Judge quick-run demo script (pure Node, no native deps)
// Prereqs: Node 20+, env RPC_URL, PRIVATE_KEY

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function loadEnvFile(candidatePaths) {
  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    return candidate;
  }
  return null;
}

function resolveEnvValue(primaryName, fallbackNames) {
  if (process.env[primaryName]) {
    return process.env[primaryName];
  }
  for (const fallbackName of fallbackNames) {
    if (process.env[fallbackName]) {
      process.env[primaryName] = process.env[fallbackName];
      return process.env[primaryName];
    }
  }
  return undefined;
}

function isPlaceholderHandle(value) {
  if (typeof value !== 'string') return true;
  const normalized = value.trim().toLowerCase();
  return normalized === '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' || normalized === '0xdeadbeef' || normalized === '0x';
}

function isByteLikeObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function normalizeBytesLike(value, fieldName) {
  if (typeof value === 'string') {
    if (!value.startsWith('0x')) {
      throw new Error(`Fixture field ${fieldName} must be a hex string or byte-like JSON object.`);
    }
    return value;
  }

  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return ethers.hexlify(Uint8Array.from(value));
  }

  if (isByteLikeObject(value)) {
    const numericKeys = Object.keys(value).filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length > 0) {
      const bytes = numericKeys.map((key) => Number(value[key]));
      return ethers.hexlify(Uint8Array.from(bytes));
    }
  }

  throw new Error(`Fixture field ${fieldName} must be a hex string, Uint8Array, or JSON object with numeric byte keys.`);
}

function normalizeCannedOrderBundle(payload) {
  const handles = payload.handles.map((handle, index) => normalizeBytesLike(handle, `handles[${index}]`));
  const inputProof = normalizeBytesLike(payload.inputProof, 'inputProof');
  return { handles, inputProof };
}

function loadCannedOrderBundle(candidatePaths) {
  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, 'utf8').trim();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Fixture at ${candidate} must be JSON with { handles, inputProof }.`);
    }

    if (!payload || !Array.isArray(payload.handles) || payload.handles.length < 2 || !('inputProof' in payload)) {
      throw new Error(`Fixture at ${candidate} must contain JSON fields handles[] and inputProof.`);
    }

    return { payload, candidate };
  }

  return null;
}

async function main() {
  const envLoadedFrom = loadEnvFile([
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'contracts', '.env'),
    path.join(process.cwd(), '.e2e.env'),
  ]);
  if (envLoadedFrom) {
    console.log(`Loaded env from: ${envLoadedFrom}`);
  }

  const RPC_URL = resolveEnvValue('RPC_URL', ['SEPOLIA_RPC_URL', 'SEPOLIA_RPC', 'ALCHEMY_RPC_URL']);
  const PRIVATE_KEY = resolveEnvValue('PRIVATE_KEY', ['DEPLOYER_PRIVATE_KEY', 'SEPOLIA_PRIVATE_KEY']);
  const checkOnly = process.argv.includes('--check');
  if (!RPC_URL) throw new Error('Missing RPC_URL. Export your Sepolia RPC endpoint (Alchemy/Infura).');
  if (!PRIVATE_KEY) {
    if (checkOnly) {
      throw new Error('Missing PRIVATE_KEY in .env. Add PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) to check wallet connectivity.');
    }
    throw new Error('Missing PRIVATE_KEY. Export a funded Sepolia private key for the demo signer (or set DEPLOYER_PRIVATE_KEY).');
  }

  const loadedFixture = loadCannedOrderBundle([
    path.join(process.cwd(), 'scripts', 'canned_order_ct.hex'),
    path.join(process.cwd(), 'scripts', 'fixtures', 'canned_order_ct.hex'),
  ]);
  if (!loadedFixture) {
    throw new Error('Missing fixture at scripts/canned_order_ct.hex or scripts/fixtures/canned_order_ct.hex. Create a canned ciphertext fixture as instructed in README.');
  }

  const { payload, candidate: fixturePath } = loadedFixture;
  const normalizedPayload = normalizeCannedOrderBundle(payload);
  console.log(`Loaded fixture from: ${fixturePath}`);

  if (!payload.handles || payload.handles.length < 2) {
    throw new Error('Fixture must include two handles for price and qty (handles array).');
  }

  if (isPlaceholderHandle(normalizedPayload.handles[0]) || isPlaceholderHandle(normalizedPayload.handles[1]) || !normalizedPayload.inputProof || normalizedPayload.inputProof === '0x') {
    throw new Error(
      'Placeholder ciphertext fixture detected. Replace scripts/fixtures/canned_order_ct.hex with a real encrypted order bundle produced by the relayer SDK before running the full demo.'
    );
  }

  console.log('Using Sepolia RPC:', RPC_URL.replace(/:\/\/.*@/, '://<REDACTED>@'));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  if (checkOnly) {
    try {
      const network = await provider.getNetwork();
      const address = await wallet.getAddress();
      const balance = await provider.getBalance(address);
      console.log('RPC OK: chainId=' + network.chainId + ' name=' + (network.name || 'unknown'));
      console.log('Wallet OK: address=' + address);
      console.log('Balance:', ethers.formatEther(balance), 'ETH');
      console.log('\nCheck OK: you can run full demo with `node scripts/judge_demo.js`');
      process.exit(0);
    } catch (err) {
      console.error('Check failed:', err.message || err);
      process.exit(2);
    }
  }

  // Load deployment artifact
  const deployPath = path.join(__dirname, '..', 'frontend', 'public', 'deployments', 'sepolia', 'DarkPoolMatcher.json');
  if (!fs.existsSync(deployPath)) throw new Error(`Deployment artifact missing at ${deployPath}`);
  const dep = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
  const contractAddress = dep.address;
  const abi = dep.abi;

  console.log('Contract address:', contractAddress);

  const contract = new ethers.Contract(contractAddress, abi, wallet);

  // Create two deterministic order IDs
  const orderA = ethers.keccak256(ethers.toUtf8Bytes('judge-order-A-' + Date.now()));
  const orderB = ethers.keccak256(ethers.toUtf8Bytes('judge-order-B-' + Date.now() + '-b'));

  try {
    console.log('Submitting order A:', orderA);
    const txA = await contract.submitOrder(orderA, normalizedPayload.handles[0], normalizedPayload.handles[1], normalizedPayload.inputProof);
    console.log('submitOrder txA sent:', txA.hash);
    await txA.wait();
    console.log('submitOrder txA mined:', `https://sepolia.etherscan.io/tx/${txA.hash}`);

    console.log('Submitting order B:', orderB);
    const txB = await contract.submitOrder(orderB, normalizedPayload.handles[0], normalizedPayload.handles[1], normalizedPayload.inputProof);
    console.log('submitOrder txB sent:', txB.hash);
    await txB.wait();
    console.log('submitOrder txB mined:', `https://sepolia.etherscan.io/tx/${txB.hash}`);

    console.log('Calling tryMatch to create MatchAttempted event...');
    const txMatch = await contract.tryMatch(orderA, orderB);
    console.log('tryMatch sent:', txMatch.hash);
    const receipt = await txMatch.wait();
    console.log('tryMatch mined:', `https://sepolia.etherscan.io/tx/${txMatch.hash}`);

    // Look for MatchAttempted or MatchSettled in logs
    const iface = new ethers.Interface(abi);
    const events = receipt.logs.map((log) => {
      try {
        return iface.parseLog(log);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    const matchAttempt = events.find(e => e.name === 'MatchAttempted');
    const matchSettled = events.find(e => e.name === 'MatchSettled');

    if (matchAttempt) {
      console.log('MatchAttempted event found:', matchAttempt.args);
    } else {
      console.log('No MatchAttempted event found in tx logs. Event names available:', events.map(e=>e.name));
    }

    if (matchSettled) {
      console.log('MatchSettled event found:', matchSettled.args);
    }

    console.log('Requesting public decryption for orderA (this marks result decryptable):');
    try {
      const txReq = await contract.requestDecryption(orderA);
      console.log('requestDecryption tx sent:', txReq.hash);
      await txReq.wait();
      console.log('requestDecryption mined:', `https://sepolia.etherscan.io/tx/${txReq.hash}`);
    } catch (err) {
      console.warn('requestDecryption failed (maybe permission require different caller):', err.message || err);
    }

    console.log('\nNext step for judge: use the browser relayer SDK or your trader client to call the relayer/browser decryption flow against the contract to retrieve the cleartext.');
    console.log('If you have a relayer available, call publicDecrypt() on the relayer with the request id, or open the browser demo and follow the Reveal flow.');

  } catch (err) {
    console.error('Error during demo run:', err.message || err);
    const msg = String(err && (err.message || err));
    if (msg.includes('Blast API is no longer available') || msg.includes('403 Forbidden')) {
      console.error('RPC provider rejected the request. Blast public endpoint is deprecated.');
      console.error('Fix: set RPC_URL/SEPOLIA_RPC_URL to a valid Sepolia RPC (for example Alchemy/Infura), then rerun.');
    }
    console.error('Remediation hints:');
    console.error('- Ensure RPC_URL is a valid, active Sepolia endpoint with request quota/auth configured.');
    console.error('- Ensure PRIVATE_KEY is funded on Sepolia and matches the transaction owner expected in contract ACLs.');
    console.error('- If events are not emitted, check that contract at the provided address matches the deployment artifact ABI and network.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
