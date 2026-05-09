# 🔐 PrivaDEX DarkPool

## What is This?

**PrivaDEX DarkPool** is a privacy-preserving cryptocurrency exchange matching engine that solves the MEV (Maximal Extractable Value) problem by keeping all order data encrypted—even during matching. Instead of exposing your bid/ask prices in the public mempool where bots can front-run you, this system matches orders inside encrypted data, so nobody can see what you're trading before it settles.

**In simple terms:** It's like a dark pool (private trading venue) but for decentralized exchanges, powered by fully homomorphic encryption (FHE) so the exchange itself can't even see the orders it's matching.

## The Problem We Solve

Today on public blockchains like Ethereum:
- Your trade sits in the **mempool** (pending transactions pool) in plain text
- Bots see your order **before it executes** and front-run it
- You get a **worse price**, and the bot keeps the difference
- **$60+ million/year** is extracted this way from retail traders alone

Example: A bot called `jaredfromsubway.eth` has done this **238,000+ times**, extracting **$7+ million** by front-running unsuspecting traders.

## Our Solution

**Encrypt first, match in secret, settle on-chain.**

We use **Fully Homomorphic Encryption (FHE)** so that:
1. Your order is encrypted before it even leaves your browser
2. The matching happens on encrypted data—nobody sees the prices
3. Only the match result gets revealed after confirmation
4. Bots have nothing to front-run because they can't see the order flow

## Tech Stack

This project combines cutting-edge cryptography with modern blockchain tooling:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Encryption** | Microsoft SEAL 4.1 (BFV + CKKS) | Off-chain encrypted order matching |
| **On-Chain** | Zama fhEVM (Ethereum Sepolia) | On-chain homomorphic matching (FHE.eq()) |
| **Smart Contracts** | Solidity + ethers.js | Order registration & settlement on Sepolia testnet |
| **Frontend** | Next.js 14 + React 18 | Live demo UI with TailwindCSS |
| **Browser Crypto** | Zama Relayer SDK | Client-side order encryption before signing |
| **Backend** | gRPC + C++ | Off-chain matching engine (legacy) |
| **Testing** | Hardware (CMake), Python (pytest), Node.js (Hardhat) | Multi-layer validation |

## Live Demo

- **DarkPoolMatcher (Sepolia)**: `0x5dB289f443C13A586aF567f379859b7aA06A8380` — on-chain fhEVM encrypted order matching
- **Frontend demo**: Start via `cd frontend && npm run dev` (Next.js 14 with live order submission UI)
- **PrivaDEXMatcher (Sepolia)**: `0x8CC6de883EbDDF11fE58a56bDC24BC8606D06710` — explicit separated-proof fhEVM encrypted bid-ask matching
- **DarkPoolSettlement (legacy)**: `0x531d76b2C94899017e94158304DF32C2188FFA23` — off-chain settlement stub

## End-to-End Workflow

1. **Browser → Relayer SDK**: User connects wallet and enters encrypted price/qty
2. **Relayer SDK** (`@zama-fhe/relayer-sdk/web`): Encrypts price/qty handles via browser instance
3. **Browser → DarkPoolMatcher**: Submits `submitOrder(orderId, handle₁, handle₂, proof)`
4. **On-Chain Matching**: `tryMatch(bidId, askId)` uses `FHE.eq()` to compare encrypted prices
5. **Result Storage**: Settled match stored as encrypted ciphertext until `requestDecryption()`
6. **Browser Reveal**: Calls relayer to decrypt match result using same browser instance

## Hybrid Architecture

PrivaDEX now uses fhEVM v0.9 on Sepolia as the primary matching layer. The original SEAL engine remains available for off-chain pre-screening (mean ~35ms), reducing on-chain gas costs for batch mode. Confirmed candidate pairs are submitted to `DarkPoolMatcher.sol` where fhEVM's coprocessor executes the binding confidential price equality check via `FHE.eq()` on `euint64` ciphertext handles. Neither layer ever sees plaintext order data.

## How It Works: The Flow

### 1. **Encrypt** (Client-Side)
```
User creates order with bid/ask price → Browser encrypts using Zama Relayer SDK → Only ciphertext leaves device
```

### 2. **Match** (On-Chain, In Ciphertext)
```
Smart contract receives encrypted bid + encrypted ask → FHE.eq() compares prices WITHOUT decrypting → Match verdict
```

### 3. **Settle** (On-Chain Result Revealed)
```
After match confirmed, only the result (matched/unmatched) gets decrypted via authorized relayer → Trader sees outcome
```

**Key point:** The exchange never sees the plaintext order. The matching happens inside encrypted data using homomorphic encryption primitives. This is mathematically verifiable and auditable on-chain.

## Project Structure

```
dark_pool/
├── frontend/                    # Next.js demo UI
│   ├── pages/index.tsx          # Main landing page + order submission UI
│   ├── pages/settlement.tsx     # Settlement/matching confirmation flow
│   ├── hooks/useDarkPool.ts     # React hook for order encryption & submission
│   ├── public/deployments/      # Contract ABIs fetched at runtime
│   └── netlify.toml             # Deployment config for Netlify
│
├── contracts/                   # Smart contracts on Ethereum Sepolia
│   ├── DarkPoolMatcher.sol      # Main FHE matching engine (on-chain)
│   ├── DarkPoolSettlement.sol   # Legacy settlement contract
│   ├── PrivaDEXDarkPool.fhEVM.sol  # FHE implementation
│   └── scripts/deployMatcher.ts # Hardhat deployment script
│
├── he_core/                     # C++ FHE library (SEAL 4.1 wrappers)
├── matching_server/             # gRPC matching service (off-chain)
├── trader_client/               # Python settlement client (legacy)
├── benchmarks/                  # Latency benchmarks for FHE operations
│
├── ARCHITECTURE.md              # Deep dive: all 17 encryption hops
├── DARKPOOL_SPEC_v2.md          # Formal crypto specification
├── BENCHMARK.md                 # Performance metrics
└── README.md                    # This file
```

## Why This Matters

Order flow on public blockchains is pure financial information gold for bots. This project proves we can build a practical DEX that **removes that information asymmetry entirely** using homomorphic encryption—so traders keep their edge.

## Technology Deep-Dive

### Encryption Layer: Microsoft SEAL 4.1

We use **two homomorphic encryption schemes** for different operations:

- **BFV (Brakerski/Fan-Vercauteren)**: Exact integer arithmetic for price matching
	- Cost: Exact equality checks (`bid == ask?`)
	- Performance: ~35ms per match
  
- **CKKS (Cheon-Kim-Kim-Song)**: Approximate floating-point arithmetic for volume/slippage
	- Cost: Continuous-value scoring (more flexible matching rules)
	- Performance: ~16ms per sign-polynomial evaluation

**Why two schemes?** CKKS is faster but approximate. BFV is slower but exact. We use BFV for the critical equality check and CKKS for secondary operations—best of both worlds.

### On-Chain Layer: Zama fhEVM on Ethereum Sepolia

The smart contracts use **`FHE.eq()`** and **`FHE.select()`** primitives provided by Zama's fhEVM. These are homomorphic operations that:
- Accept encrypted inputs
- Return encrypted outputs
- Never decrypt data on-chain (only authorized parties can decrypt off-chain)

This makes the matching **verifiable and trustless** - anyone can audit the contract to confirm no decryption happens until settlement.

### Browser Integration: Zama Relayer SDK

The frontend uses **`@zama-fhe/relayer-sdk`** which:
1. Generates encrypted handles from plaintext bid/ask/qty
2. Creates a zero-knowledge proof of correct encryption
3. Submits both to the smart contract
4. Later, authorizes decryption to reveal only the match result

## End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       TRADER'S BROWSER                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step 1: Enter Order (bid=100, ask=105, qty=1)           │   │
│  │ Step 2: Click "Encrypt & Submit"                        │   │
│  │ Step 3: Zama SDK encrypts locally                       │   │
│  │         → bid_encrypted, ask_encrypted, proof           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
														↓
				 (Only encrypted data travels over network)
														↓
┌─────────────────────────────────────────────────────────────────┐
│              ETHEREUM SEPOLIA SMART CONTRACT                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ DarkPoolMatcher.sol receives:                           │   │
│  │  - orderId                                               │   │
│  │  - bid_encrypted (euint32 handle)                        │   │
│  │  - ask_encrypted (euint32 handle)                        │   │
│  │  - Validity proof                                        │   │
│  │                                                          │   │
│  │ Contract executes (in ciphertext):                       │   │
│  │  FHE.eq(bid_encrypted, ask_encrypted) → result_encrypted│   │
│  │                                                          │   │
│  │ Stores: result_encrypted (still encrypted!)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
														↓
				 (Order matched, but result still encrypted)
														↓
┌─────────────────────────────────────────────────────────────────┐
│                    SETTLEMENT (Off-Chain)                       │
│  After confirmation, authorized party requests decryption       │
│  → Zama Relayer decrypts using trader's private key             │
│  → Only trader learns their match result                        │
└─────────────────────────────────────────────────────────────────┘
```

## What We Protect Against

- ✅ **Mempool snooping** - Your order is ciphertext, not numbers bots can see
- ✅ **Front-running** - Prices never exposed before execution
- ✅ **Sandwich attacks** - Attacker learns only matched/unmatched, not price details
- ✅ **Exchange privacy breach** - Smart contract can't see plaintext orders
- ✅ **On-chain analysis** - Only encrypted order hashes stored on-chain

## Getting Started for Developers

### Prerequisites
- Node.js 20+ (npm comes with it)
- MetaMask or any Web3 wallet
- Sepolia testnet ETH (get free from [faucet](https://sepolia-faucet.pk910.de/))

### 1. Clone & Install
```bash
git clone https://github.com/raghavpathak30/PRIVAdex.git
cd dark_pool
npm install
```

### 2. Run Frontend Demo
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:3000`

### 3. Connect to Sepolia
- Open frontend at localhost:3000
- Click "Connect Wallet"
- Approve MetaMask to switch to Sepolia testnet
- You'll automatically be switched to Sepolia

### 4. Submit Your First Encrypted Order
1. Click "Try the live demo"
2. Select BID or ASK
3. Enter an ETH amount and USDC limit price
4. Click "Encrypt & Submit Order"
5. Approve the transaction in MetaMask
6. Watch the execution log show your order being processed on-chain

## Building from Source (Advanced)

### Deploy Your Own Contract to Sepolia
```bash
cd contracts
npm install

# Set your Sepolia RPC and private key
export ALCHEMY_API_KEY=<your-alchemy-key>
export DEPLOYER_PRIVATE_KEY=<your-private-key>

# Deploy
npx hardhat run scripts/deployMatcher.ts --network sepolia
```

### Build the C++ Matching Engine (Legacy)
```bash
cmake -S . -B build
cmake --build build -j4
ctest --test-dir build
```
Expected: `14/14 tests PASS`

See [DARKPOOL_SPEC_v2.md](DARKPOOL_SPEC_v2.md) for full normative details.

## Documentation & References

For deeper technical details:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete encrypted data lifecycle (17 hops) and system design
- **[DARKPOOL_SPEC_v2.md](DARKPOOL_SPEC_v2.md)** - Formal cryptographic spec, threat model, parameter justification  
- **[BENCHMARK.md](BENCHMARK.md)** - Performance metrics, latency breakdown by operation
- **[dApp_SUBMISSION.md](dApp_SUBMISSION.md)** - Zama Builder Track submission details

## Performance Metrics

Latest benchmark results (N=100 orders):

| Metric | Value |
|--------|-------|
| Mean latency | 38.5ms |
| P95 latency | 41.5ms |
| P99 latency | 45.2ms |
| Per-byte cost | ~0.5μs |
| Gate status | ✅ PASS (p99 < 150ms) |

## Deployed Addresses (Sepolia Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| DarkPoolMatcher | `0x5dB28...6A8380` | Primary FHE matching engine |
| PrivaDEXMatcher | `0x8CC6d...06D06710` | Alternative with separated proofs |
| DarkPoolSettlement | `0x531d7...FFA23` | Legacy settlement (v1.0) |

## Contributing

This is an open submission for Zama's Builder Track. If you want to:
- Report bugs: Open an issue on GitHub
- Suggest improvements: Submit a discussion or PR
- Deploy locally: Follow the "Getting Started" section above

## Credits & Stack

Built with:
- **Zama**: fhEVM & Relayer SDK for on-chain & browser homomorphic encryption
- **Microsoft**: SEAL 4.1 library for off-chain FHE operations
- **Ethereum**: Sepolia testnet for deployment & verification
- **Next.js**: Modern React framework for the demo UI
- **Hardhat**: Solidity development & deployment tooling

## License & Contact

For questions or collaboration: **Raghav Pathak** — [GitHub](https://github.com/raghavpathak30)


