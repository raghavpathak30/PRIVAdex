# PrivaDEX DarkPool Project State

Source of truth used: DARKPOOL_SPEC_v2.md (Version 2.0).

## Build Order (§1.1)

- [x] Step 1: SEAL 4.1.1 smoke_test.cpp
- [x] Step 2: CKKSContextDP struct (ckks_context_dp.h/cpp)
- [x] Step 3: BFVContextDP struct (bfv_context_dp.h/cpp)
- [x] Step 4: order_encoder.cpp + static_assert
- [x] Step 5: serialize_pool_keys.py + round-trip
- [x] Step 6: sign_poly_eval.cpp (Minimax degree-27 PS)
- [x] Step 6.a: Resolved transparent ciphertext via level alignment
- [x] Step 7: bfv_equality_eval.cpp
- [x] Step 7.a: Resolved std::bad_alloc via recursive squaring
- [x] Step 8: slot_blinding.cpp
- [x] Step 9: matching_engine.cpp benchmark
- [x] Step 10: darkpool.proto (protoc compile)

## Matching Engine Path (§1.2)

- [x] Step 11: trader_client.py (Pybind11 zero-copy)
- [x] Step 12: order_nonce_store.py + replay guard
- [x] Step 13: matching_server (C++ gRPC, DarkPool context)
- [x] Step 13.a: Integrate SEAL serialization with gRPC byte-streams
- [x] Step 14: TraderClient (submit_order contract)
- [x] Step 15: Settlement bridge (settle_bridge.py + Solidity stub)
- [x] Step 16: Research evidence collection

## Verification Notes

- CKKS degree-27 context chain is configured to {60,40,40,40,40,60}.
- CKKS Galois key set includes {1,2,4,8,16,32,64,128,256,512}.
- Step 6 code files exist (`he_core/include/sign_poly_eval.h`, `he_core/src/sign_poly_eval.cpp`) and pass diagnostics.
- Catch2 gate test file added: `tests/test_darkpool.cpp`.
- Step 6 implementation now includes degree-27 coefficient table, baby-step precompute, depth-4 alignment to fifth_parms_id, and a Catch2 behavior-check placeholder.
- Build/test harness is wired via `CMakeLists.txt` + `tests/CMakeLists.txt` and compiles successfully.
- Current targeted runtime status (`ctest -R smoke_test|bfv_equality_eval|sign_poly_eval|slot_blinding`):
	- `smoke_test`: PASS (SEAL 4.1.x compatibility accepted)
	- `sign_poly_eval` depth invariant: PASS
	- `slot_blinding` identity: PASS
	- `bfv_equality_eval`: PASS with deterministic semantics (equal->1, not-equal->0)
- Step 10 protobuf completed: `proto/darkpool.proto` created and code generation target emits to `build/generated/`.
- Step 13.a serialization bridge completed with helpers in `matching_server/include/seal_serialization.h` and `matching_server/src/seal_serialization.cpp`.
- Matching service completed: `matching_server/src/matching_server.cpp` implements `ExecuteMatch` for CKKS and BFV flows, includes `Ping`/`Pong` health RPC, and server entrypoint handles SIGINT/SIGTERM clean shutdown.
- Integration test completed: `matching_server/src/matching_server_test.cpp` spins up server, validates `Ping`, submits known BFV cases via gRPC, decrypts response, and asserts equal=>1 / unequal=>0.
- Benchmark completed: `benchmarks/engine_bench.cpp` runs N=100 iterations, reports mean/p95/p99, writes JSON summary (`engine_bench_summary.json`), and enforces gate `p99 < 150 ms` via exit code.
- Latest benchmark gate result (`ctest -R benchmark_gate`): mean=38.5274 ms, p95=41.502 ms, p99=45.164 ms.
- Full regression status (`ctest --output-on-failure`): 14/14 tests PASS (was 13/13; `concurrent_submit` is the new gate).
- Step 11 verified: `python3 trader_client/smoke_test_trader.py` exits 0; CKKS ciphertext size ~3.125 MB.
- Settlement bridge completed: `trader_client/settle_bridge.py` decrypts BFV match results, calls `settle_on_chain()`, and raises structured `SettlementError(stage=...)` on decrypt/tx failures.
- Solidity settlement stub added in `contracts/DarkPoolSettlement.sol` with authorized settler access control, settlement storage, event emission, and fhEVM migration comments.
- Deployment helper added in `contracts/deploy_settlement.py`; config template added in `settlement_config.json`.
- New pytest gate `settle_bridge_pytest` passes; full ctest now passes 14/14.
- Evidence bundle added: root `README.md`, `ARCHITECTURE.md`, `BENCHMARK.md`, and `evidence/*` artifacts.
- BFV equality semantics are now equal => 1, unequal => 0 (previously equal => 0, unequal => non-zero).
- `concurrent_submit_test.cpp` added: prebuilds payloads, calls `MatchingServiceImpl` directly with 8 parallel threads, and uses independent `ServerContext` per thread.
- SEAL zstd compression enabled on serialization (`compr_mode_type::zstd`).
- Nonce store persisted to SQLite3 and survives restart; replay gate verified (`submit -> restart -> resubmit same nonce -> ERR_REPLAY`).
- Pool scheme registry added: `use_bfv` is server-enforced per `pool_id` from `settlement_config.json`; client-supplied value is overridden.
- Helgrind limitation: Helgrind aborts inside SEAL 4.1.1 `MemoryPoolMT` before a complete report (known Valgrind/SEAL compatibility issue), so TSAN remains the authoritative race-detection gate.

## Blocker Resolution (Post-Audit)

- BLOCKER 1 RESOLVED — `acc_buf_` and `out_buf_` moved from class members to local variables inside `SubmitOrder()`. Concurrent requests no longer share mutable state. TSAN gate clean (earlier run; final re-run skipped by user — earlier evidence preserved).
- BLOCKER 2 RESOLVED — OpenMP parallel `rotate_vector` loop replaced with sequential loop. False "NTT caching" claim removed from comments. `slot_blinding` and `sign_poly_eval` Catch2 tests still pass.
- BLOCKER 3 RESOLVED — `ev.exponentiate()` with 30-bit exponent removed. Replaced with low-depth equality test (subtract -> square -> clamp, depth 2). BFV equality semantics updated: equal => 1, unequal => 0.
- BLOCKER 4 RESOLVED — `sign_poly_eval_d27` Catch2 gate strengthened to 5-point numerical bounds. Coefficient validation Python script added.
