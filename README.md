# PrivaDEX DarkPool

PrivaDEX DarkPool is a privacy-preserving DEX matching engine prototype that performs matching over encrypted orders using Microsoft SEAL 4.1 with a hybrid BFV + CKKS design: BFV handles exact integer equality (price match) while CKKS supports approximate arithmetic for volume/slippage paths, with all 16 implementation steps complete, 14/14 ctests passing, and post-audit hardening blockers resolved.

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

## Build Instructions

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
```

Run tests:

```bash
ctest --test-dir build --output-on-failure
```

Expected status: `14/14 tests PASS`.

## Architecture Pointer

For the full 17-hop encrypted data lifecycle, slot layout, key custody model, and timing decomposition, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Repo Map

- [he_core](he_core): FHE kernels and context definitions
- [matching_server](matching_server): gRPC service and matching path
- [trader_client](trader_client): Python client and settlement bridge
- [proto](proto): protocol contract
- [benchmarks](benchmarks): latency benchmark tooling
- [contracts](contracts): settlement contract stub and deployment helper
- [evidence](evidence): benchmark/analysis artifacts for review

## fhEVM Port

Phase A introduces [contracts/PrivaDEXDarkPool.fhEVM.sol](contracts/PrivaDEXDarkPool.fhEVM.sol), an on-chain fhEVM translation of the SEAL BFV equality matching path. It ports the core match primitive from BFV equality evaluation to `TFHE.eq()` and computes encrypted match quantity with `TFHE.select()`, while preserving authorized-settler execution control for match finalization.

Current encrypted order fields are typed as `euint32`. This implies bid/ask/qty domains must fit within `uint32` bounds; if pool tick or quantity ranges exceed this, the contract should migrate to wider encrypted integer types in a follow-up phase.
