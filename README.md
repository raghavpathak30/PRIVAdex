# PrivaDEX DarkPool

PrivaDEX DarkPool is a privacy-preserving DEX matching engine prototype that performs matching over encrypted orders using Microsoft SEAL 4.1 with a hybrid BFV + CKKS design: BFV handles exact integer equality (price match) while CKKS supports approximate arithmetic for volume/slippage paths, with all 16 implementation steps complete, 14/14 ctests passing, and post-audit hardening blockers resolved.

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

## Why This Matters

Public mempool order flow leaks bid/ask intent and creates a front-running surface. This project demonstrates a practical encrypted matching pipeline where plaintext order values are never exposed on the server-side matching path.

## Threat Model Highlights (T-01 to T-08)

- T-01 Passive eavesdropper: ciphertext-only transport and storage.
- T-02 Malicious matching engine: engine holds no secret key.
- T-03 Front-runner/MEV observer: encrypted order book state.
- T-04 Slot correlation: order-level slot blinding with random rotation.
- T-05 Match-pattern leakage: fixed cadence + dummy-order protocol.
- T-06 Replay: monotone nonce with durable server-side replay guard.
- T-07 Parameter mismatch: `parms_id` validation on load.
- T-08 Timing correlation: constant-window matching strategy.

See [DARKPOOL_SPEC_v2.md](DARKPOOL_SPEC_v2.md) for full normative details.

## Hybrid BFV + CKKS Rationale

- BFV path: exact integer semantics for equality (`bid == ask`), now hardened to low-depth evaluation (subtract -> square -> clamp), with deterministic output semantics equal => 1, unequal => 0.
- CKKS path: approximate arithmetic for continuous-value computations (e.g., volume/slippage), including degree-27 sign polynomial evaluation.
- This split keeps exact-comparison correctness where needed while preserving practical expressiveness for real-valued operations.

## Cryptographic Parameters (SEAL 4.1)

- Poly modulus degree: `n = 16384`
- CKKS coeff modulus:
	- Degree-27 path: `{60,40,40,40,40,60}`
	- Degree-15 fast path: `{60,40,40,40,60}`
- BFV coeff modulus: `{60,30,30,30,60}`
- Galois key sets:
	- CKKS: `{1,2,4,8,16,32,64,128,256,512}`
	- BFV: `{1,2,4,8,16,32,64,128,256}`

## Performance Snapshot

Latest benchmark gate result (`N=100`):

- mean: `38.5274 ms`
- p95: `41.502 ms`
- p99: `45.164 ms`
- gate: `p99 < 150 ms` (PASS)

Detailed methodology and gate definitions are in [BENCHMARK.md](BENCHMARK.md).

## Build & Deployment Instructions

### Contracts & Frontend

Prerequisites:
- Node.js 20+ (Node 22+ recommended for relayer SDK)
- Hardhat 2.28.6+
- Next.js 14.2+

Setup:

```bash
# Install root and contracts dependencies
npm install
cd contracts && npm install

# Set environment for Sepolia deployment
export ALCHEMY_API_KEY=<your-alchemy-key>
export PRIVATE_KEY=<your-deployer-key>

# Compile Solidity
npm run compile

# Deploy DarkPoolMatcher to Sepolia
cd scripts && npx hardhat run deployMatcher.ts --network sepolia
```

Frontend:

```bash
cd frontend && npm install
npm run dev          # local dev server
npm run build        # production build
npm run start        # production server
```

### Legacy SEAL Engine

Prerequisites:
- CMake (>= 3.20)
- C++17 toolchain (GCC/Clang)
- Python 3.10+
- gRPC + protoc
- Microsoft SEAL 4.1.x

Build:

```bash
cmake -S . -B build
cmake --build build -j
ctest --test-dir build --output-on-failure
```

Expected status: `14/14 tests PASS`.

## Architecture Pointer

For the full 17-hop encrypted data lifecycle, slot layout, key custody model, and timing decomposition, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Repo Map

- [contracts](contracts)
  - `contracts/DarkPoolMatcher.sol` — on-chain fhEVM matcher with encrypted input handling
  - `contracts/DarkPoolSettlement.sol` — legacy settlement stub (v1.0, fhEVM v0.9)
  - `scripts/deployMatcher.ts` — Hardhat Sepolia deployment script
  - `typechain-types/` — auto-generated TypeScript types for contracts
  
- [frontend](frontend)
  - `pages/index.tsx` — main demo landing page with order submission UI
  - `hooks/useDarkPool.ts` — React hook for encrypted order flows (submit/match/reveal)
  - `public/deployments/sepolia/` — deployment artifacts for browser runtime fetch
  
- [he_core](he_core): SEAL context wrappers and core encrypted kernels (legacy)
- [matching_server](matching_server): gRPC service and matching path (legacy)
- [trader_client](trader_client): Python client and settlement bridge (legacy)
- [proto](proto): protocol contract (legacy)
- [benchmarks](benchmarks): latency benchmark tooling (legacy)
- [evidence](evidence): benchmark/analysis artifacts for review

## Deployment

The primary settle contract is [contracts/DarkPoolSettlement.sol](contracts/DarkPoolSettlement.sol), which performs on-chain FHE matching using Zama fhEVM v0.9 primitives:

- **Deployed address (Sepolia):** `0x531d76b2C94899017e94158304DF32C2188FFA23`
- **Etherscan link:** https://sepolia.etherscan.io/address/0x531d76b2C94899017e94158304DF32C2188FFA23
- **Settlement contract upgrades:**
  - `settleMatch()` now accepts two encrypted prices (`encPriceA`, `encPriceB`) and performs on-chain comparison via `FHE.eq()`.
  - Uses `FHE.fromExternal()` to decrypt external encrypted inputs.
  - Applies `FHE.allowThis()` and `FHE.allow()` to enable authorized access for counterparties and settler.

### Redeployment

To redeploy from scratch:

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```

The deployment writes `contracts/deployment.json` with the contract address, network, and timestamp for auditing and CI/CD integration.

## fhEVM Port

Phase A introduces [contracts/PrivaDEXDarkPool.fhEVM.sol](contracts/PrivaDEXDarkPool.fhEVM.sol), an on-chain fhEVM translation of the SEAL BFV equality matching path. It ports the core match primitive from BFV equality evaluation to `TFHE.eq()` and computes encrypted match quantity with `TFHE.select()`, while preserving authorized-settler execution control for match finalization.

Current encrypted order fields are typed as `euint32`. This implies bid/ask/qty domains must fit within `uint32` bounds; if pool tick or quantity ranges exceed this, the contract should migrate to wider encrypted integer types in a follow-up phase.

### Step 15 E2E Verification Modes

Use these two targets to separate local developer behavior from strict CI behavior:

- `make e2e-test`
	- Uses local RPC/deploy wiring and runs `tests/test_e2e_settlement.py`.
	- On a plain Hardhat node (no TFHE runtime), the test is expected to be **Skipped** with reason: missing fhEVM precompiles.
- `make e2e-test-fhevm`
	- Runs a strict pre-flight RPC check against TFHE precompile address `0x000000000000000000000000000000000000005d`.
	- If `eth_getCode` at that address is empty (`0x`/`0x0`), it hard-fails with:
		`CRITICAL: Target RPC does not support TFHE precompiles. Use 'fhevm-hardhat' node to run this test.`
	- If pre-flight passes, it runs the same pytest with `REQUIRE_FHEVM=1`, which converts runtime-missing conditions into a **Failed** test (no skip allowed).

Interpretation:

- **Skipped** in `e2e-test`: local dev environment is not fhevm-enabled.
- **Failed** in `e2e-test-fhevm`: regression or misconfigured fhevm CI runtime.
