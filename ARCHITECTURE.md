# Architecture

This document summarizes the end-to-end architecture of the PrivaDEX DarkPool FHE matching engine, aligned with the normative spec in `DARKPOOL_SPEC_v2.md`.

## System Components

- `he_core/`: SEAL context wrappers and core encrypted kernels.
- `matching_server/`: gRPC matching service and replay-protected order handler.
- `trader_client/`: Python submission/decryption/bridge pipeline.
- `contracts/`: settlement contract stub (v1.0) with fhEVM migration notes.

## Hybrid Scheme Design

- BFV path: exact integer equality for price matching, deterministic semantics (`equal => 1`, `unequal => 0`).
- CKKS path: approximate arithmetic for continuous-value computations.
- Both use `n=16384`; key material and kernel paths are scheme-dispatched by server policy.

## Data Lifecycle Trace (17 Hops)

Aligned with spec Section 3:

1. Trader -> TraderClient: submit bid/ask/qty.
2. TraderClient feature pack: flatten to contiguous vector.
3. TraderClient -> Pybind11 wrapper: zero-copy buffer handoff.
4. Encrypt order: BFV or CKKS ciphertext creation.
5. Serialize ciphertext to bytes.
6. Transport over gRPC request.
7. Server deserializes into SEAL ciphertext.
8. Slot blinding rotation applied server-side.
9. Difference/equality pre-kernel lane prep.
10. Kernel eval: CKKS sign polynomial or BFV equality eval.
11. Accumulation and hoisted tree-sum reduction.
12. Unblind result slots.
13. Serialize response ciphertext.
14. gRPC response transport back to client.
15. TraderClient decrypts result.
16. Threshold/extract match outcome.
17. Settlement bridge posts settlement to contract.

## Slot Layout (Stride-512, 16 Orders)

For each order index `k` in `[0..15]`:

- bid lane: `slot[k*512 + 0]`
- qty lane: `slot[k*512 + 1]`
- ask lane: `slot[k*512 + 256]`

Match output after reduction is read from:

- result lane: `slot[k*512]`

This fixed geometry is shared across encoding, blinding, and extraction logic.

## Key Distribution Audit

- Secret keys (CKKS/BFV): trader client only; never present on matching server.
- Public keys: trader client + matching server.
- Relinearization keys: matching server.
- Galois keys: matching server.

Operational rule: engine-side deployment with secret key is out of policy.

## MatchTimingBreakdown (6 Fields)

The matching RPC reports six timing fields:

- `deserialization_us`
- `slot_blind_us`
- `sign_poly_us`
- `accumulate_us`
- `serialization_us`
- `total_match_us`

Invariant:

`deserialization_us + slot_blind_us + sign_poly_us + accumulate_us + serialization_us ~= total_match_us`

Small residual overhead comes from control-path work (nonce checks and bookkeeping).

## Replay Protection and Policy Enforcement

- Replay gate: nonce persistence in SQLite3 across process restarts.
- Scheme policy: server enforces pool-level scheme registry by `pool_id` and overrides conflicting client flags.

## Browser → Contract Flow (May 2026)

### Encrypted Order Submission Path

1. **Browser Order Input**:
   - User enters price, quantity, and order ID in Next.js frontend
   - MetaMask wallet connection via ethers `BrowserProvider`

2. **Browser-Side Encryption** (Zama Relayer SDK v0.4.3):
   - Dynamic import of `@zama-fhe/relayer-sdk/web` (critical: not root export)
   - `createInstance({ ...SepoliaConfig, network: window.ethereum })`
   - `fhevm.createEncryptedInput(matcherAddress, userAddress)`
   - `input.add64(price)` → `input.add64(qty)` → `encrypted = await input.encrypt()`
   - Returns `{ handles: [handle₁, handle₂], inputProof }`

3. **Contract Submission**:
   - `submitOrder(orderId, handle₁, handle₂, inputProof)`
   - Contract converts external handles via `FHE.fromExternal(handle, inputProof, inputType)`
   - Stores encrypted price/qty in contract state, grantsACL for trader

### Encrypted Matching Path

4. **On-Chain Matching**:
   - `tryMatch(bidId, askId)`
   - Retrieves bid order (encPrice_bid, encQty_bid) and ask order (encPrice_ask, encQty_ask)
   - Calls `FHE.eq(encPrice_bid, encPrice_ask)` → encrypted boolean result
   - Calls `FHE.select(matchedFlag, encQty_bid, zero)` to conditionally settle quantity
   - Stores encrypted result (price match + settled qty) in contract
   - Emits `MatchSettled(bidId, askId)` event

5. **Decryption Request & Reveal**:
   - Browser calls `requestDecryption(bidId)` to signal match is readable
   - Contract calls `FHE.makePubliclyDecryptable(encResult)` via relayer ACL
   - Browser relayer SDK fetches encrypted result from contract state
   - Relayer network decrypts off-chain and returns cleartext match result
   - Match result displayed in browser UI

## Deployment Artifact Strategy

**Dual-Storage Pattern**:
- Repo-level artifact: `deployments/sepolia/DarkPoolMatcher.json` (for Git history)
- Frontend-public artifact: `frontend/public/deployments/sepolia/DarkPoolMatcher.json` (for browser `fetch()`)

**Runtime Fetch** (not build-time):
- Hook `useDarkPool.ts` calls `fetch('/deployments/sepolia/DarkPoolMatcher.json', { cache: 'no-store' })`
- Returns `{ address, abi, blockNumber, network }`
- Zero coupling between build-time and deployment state; supports live migration

## Technical Constraints & Patterns

1. **SDK Entrypoint**: Zama relayer SDK v0.4.3 exports from `/web` subpath, not root. Root export not available.
2. **Node Engine**: SDK requires Node >=22 (strict). Environment uses Node 20.20.2; install succeeds but with warning.
3. **Circular Dependency Warning**: Webpack circular dependency warning during frontend build is non-blocking (documented as acceptable).
4. **Error Handling**: All SDK/artifact loading errors throw informative messages directing user to install or deploy first.

## On-Chain Settlement Boundary (Legacy fhEVM v0.9)

Settlement uses fhEVM v0.9 encrypted on-chain state for match results.

The trader client performs off-chain decryption via the @zama-fhe/relayer-sdk (publicDecrypt), then submits the cleartext and ZK proof on-chain for verification via FHE.checkSignatures(). This is the fhEVM v0.9 self-relaying model.
