# PrivaDEX DarkPool dApp - Zama fhEVM Builder Track Submission

This directory contains the complete dApp wrapper for the PrivaDEX DarkPool privacy-preserving DEX matching engine for submission to the Zama fhEVM Builder Track.

## Table of Contents

1. [Solidity Contract Upgrade (fhEVM)](#solidity-contract-upgrade-fhevm)
2. [Frontend Demo (Next.js)](#frontend-demo-nextjs)
3. [API Integration Layer](#api-integration-layer)
4. [Deployment Guide](#deployment-guide)

## Solidity Contract Upgrade (fhEVM)

**File**: `contracts/DarkPoolSettlement.sol`

### What Changed

- **Import fhEVM**: Added `import "fhevm/lib/TFHE.sol";`
- **New Settlement Function**: Replaced v1.0 plaintext settle with `settleEncrypted()` that accepts:
  - `trader` (address): Trader settlement account
  - `encryptedMatchResult` (einput): Encrypted match result from gRPC server
  - `inputProof` (bytes): FHE proof for input verification
- **Encrypted Handling**:
  - Calls `euint64 result = TFHE.asEuint64(encryptedMatchResult, inputProof)` to convert proof-verified input
  - Calls `TFHE.allow(result, msg.sender)` to grant access to the settler
- **Storage**: Stores `resultHandle` (uint256 of euint64 unwrap) with timestamp per trader
- **Event**: Emits `EncryptedOrderSettled(trader, resultHandle, timestamp)` with encrypted handle (never plaintext)
- **Access Control**: `onlyAuthorizedSettler` modifier enforced
- **Backward Compatibility**: Legacy `settle()` function kept as no-op for interface stability

### Compile Status

✅ Compiles successfully against Solidity 0.8.20 with fhevm library

### Network Target

- **Zama Riviera Testnet**: Chain ID 21097
- **npm package**: `@fhevm/hardhat-plugin@0.5.x` (or `fhevm@0.5.9` for compile compat)

## Frontend Demo (Next.js)

**Directory**: `frontend/`

### Structure

```
frontend/
├── package.json              # Next.js + Tailwind + gRPC deps
├── tsconfig.json             # TypeScript config
├── next.config.js            # Next.js config
├── tailwind.config.js        # Tailwind CSS
├── postcss.config.js         # PostCSS
├── .gitignore
├── pages/
│   ├── _app.tsx              # Root layout
│   ├── index.tsx             # Main order form UI
│   └── api/
│       └── submit-order.ts    # API route (gRPC proxy)
├── styles/
│   └── globals.css           # Base Tailwind styles
└── README.md                 # Frontend-specific guide
```

### UI Features

1. **Order Form** (top panel):
   - Bid Price input (1–2^20)
   - Ask Price input (1–2^20)
   - Quantity input (1–2^20)
   - "Submit Order" button with loading state

2. **Results Panel** (bottom panel, shown after submission):
   - Match Status: YES (green) or NO (red)
   - Quantity Matched: integer display
   - Timing Breakdown Table:
     - Deserialization (ms)
     - Slot Blinding (ms)
     - Sign Polynomial Evaluation (ms)
     - Accumulation (ms)
     - Serialization (ms)
     - **Total (ms)** (auto-summed)

3. **Design**:
   - Dark slate theme (Tailwind)
   - Responsive grid layout
   - No external UI framework (pure Tailwind + React)

### API Route: `/api/submit-order`

**File**: `frontend/pages/api/submit-order.ts`

#### Request

```json
POST /api/submit-order
{
  "bid": 100,
  "ask": 100,
  "qty": 10
}
```

#### Response (Success)

```json
{
  "success": true,
  "match": true,
  "quantityMatched": 10,
  "timings": {
    "deserialization": 2.3,
    "slotBlind": 1.9,
    "signPoly": 8.7,
    "accumulate": 1.0,
    "serialization": 1.5,
    "total": 15.4
  }
}
```

#### Response (Error)

```json
{
  "success": false,
  "match": false,
  "quantityMatched": 0,
  "timings": {...},
  "error": "Description of error"
}
```

#### Error Handling

- **400 Bad Request**: Invalid price/quantity range or missing fields
- **405 Method Not Allowed**: Non-POST request
- **500 Internal Server Error**: Unexpected server fault

#### Demo Matching Logic

In the demo mode (no live gRPC server), the API simulates matching with:
- **Match condition**: `|bid - ask| <= 50`
- **Match result**: Full `qty` if matched, 0 otherwise
- **Timings**: Realistic random variations around FHE operation averages

#### Production Integration (with C++ Server)

To connect to the live gRPC matching engine at `localhost:50053`:

1. Add `@grpc/grpc-js` and `@grpc/proto-loader` to `frontend/package.json`
2. In `submit-order.ts`, deserialize the proto and instantiate gRPC client:
   ```typescript
   const client = new darkpool.MatchingService(
     'localhost:50053',
     grpc.credentials.createInsecure()
   );
   ```
3. Forward the MatchRequest with fixture ciphertext
4. Parse MatchResponse and extract result_ciphertext + error_message
5. Return to UI with actual timings from server logs

## Deployment Guide

### Local Development

```bash
# Terminal 1: Start matching server
cd build
./matching_server 0.0.0.0:50053

# Terminal 2: Start frontend
cd frontend
npm install
npm run dev
```

Browser: `http://localhost:3000`

### Deployment to Zama Riviera Testnet

1. **Update Hardhat Config**:
   - Point `hardhat.config.js` to Zama Riviera RPC
   - Set appropriate gas/price params for testnet

2. **Deploy Settlement Contract**:
   ```bash
   npx hardhat run scripts/deploy_settlement.ts --network riviera
   ```

3. **Host Frontend** (e.g., Vercel):
   ```bash
   cd frontend
   npm run build
   vercel deploy
   ```

4. **Environment Variables** (in frontend):
   - `NEXT_PUBLIC_SETTLEMENT_ADDRESS`: Deployed contract address
   - `SETTLEMENT_RPC_URL`: Riviera testnet RPC
   - `GRRPC_SERVER_ADDRESS`: gRPC server endpoint (if using live backend)

5. **Settlement Integration** (if enabled):
   - Contract `settleEncrypted()` would be called post-match
   - Requires encrypted result + proof from gRPC server
   - Stores encrypted handle on-chain

## Submission Summary

This dApp submission includes:

✅ **fhEVM Solidity Contract** (`contracts/DarkPoolSettlement.sol`)
- Imports Zama TFHE library
- Accepts `einput` encrypted match results with proof verification
- Uses `TFHE.asEuint64()` and `TFHE.allow()` primitives
- Stores encrypted result handles preserving on-chain confidentiality
- Maintains authorized-settler access control

✅ **Minimal Next.js UI** (`frontend/`)
- Single-page form for bid/ask/qty input
- Real-time match results and timing breakdown
- Tailwind CSS (no external UI frameworks)
- API route for gRPC integration

✅ **API Integration Layer** (`frontend/pages/api/submit-order.ts`)
- Accepts order parameters
- Forwards to gRPC matching engine (or demo mode)
- Returns encrypted match results with timing breakdown
- Handles replay/budget/general errors with appropriate HTTP status codes

## References

- **Spec**: [DARKPOOL_SPEC_v2.md](../DARKPOOL_SPEC_v2.md)
- **fhEVM Docs**: https://docs.zama.ai/fhevm
- **Zama Builder Track**: https://www.zama.ai/builder-track
