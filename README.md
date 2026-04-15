# PrivaDEX DarkPool

PrivaDEX DarkPool is a private order-matching prototype that keeps order details encrypted while the engine checks whether two orders can match. It matters because it shows how a realistic market workflow can be built around confidential computation without exposing prices and quantities during matching, which is useful for privacy-preserving trading systems, cryptography teams, and reviewers evaluating whether FHE can support a real application stack.

## Architecture

The system is built as an off-chain FHE pipeline with a matching service, a Python trader client, and an on-chain settlement stub. The full flow is documented in [ARCHITECTURE.md](ARCHITECTURE.md), which walks through the FHE layer, matching engine, replay protection, settlement bridge, and the fhEVM migration path.

At the cryptography layer, the project uses Microsoft SEAL 4.1.2 with two contexts: CKKS for approximate arithmetic and BFV for exact integer matching. The CKKS path includes the degree-27 sign polynomial evaluator and slot blinding. The BFV path includes exact equality evaluation and is used for integer order comparison. These kernels are exercised by Catch2 tests and by the end-to-end gRPC path.

The matching engine is a gRPC server that accepts encrypted orders, enforces replay protection with a native SQLite nonce store, and dispatches either CKKS or BFV matching logic. It also exposes a Ping/Pong health check. The Python trader client validates inputs, encrypts orders through the Pybind11 SEAL wrapper, attaches a 16-byte nonce, and submits orders to the server.

Settlement is handled separately by a Python bridge. After a matched result is returned, the bridge decrypts the BFV result, extracts the matched price and quantity, and calls a Solidity settlement contract through web3.py. The contract stub, [contracts/DarkPoolSettlement.sol](contracts/DarkPoolSettlement.sol), is written so the matching logic can later move to fhEVM without changing the public settlement shape.

## Performance Results

The benchmark artifact at [build/engine_bench_summary.json](build/engine_bench_summary.json) reports `N=100` measured iterations with `mean_ms=35.2699`, `p95_ms=38.276`, and `p99_ms=40.968`. The benchmark gate is `p99 < 150 ms`, and the result is pass.

That leaves about 109 ms of p99 headroom, which is enough to absorb normal machine variation and still keep the current local matching path comfortably under the gate.

## Build & Run

Prerequisites:
- SEAL 4.1.1 or compatible 4.1.x build
- CMake
- Python 3.x
- gRPC
- web3.py

Build:
```bash
cmake -S . -B build && cmake --build build -j
```

Test:
```bash
ctest --test-dir build --output-on-failure
```

Expected output:
- `13/13 PASS`

## Project Structure

- [he_core/](he_core/) - SEAL context setup and FHE kernels: CKKS, BFV, sign polynomial, equality, slot blinding, hoisted tree sum.
- [matching_server/](matching_server/) - gRPC server, serialization helpers, replay guard, and integration test.
- [trader_client/](trader_client/) - Python trader client, Pybind11 bridge, nonce store, submit-order contract, settlement bridge, and pytest gates.
- [contracts/](contracts/) - Solidity settlement stub and deployment script for the on-chain settlement layer.
- [benchmarks/](benchmarks/) - End-to-end latency benchmark and gate wiring.
- [proto/](proto/) - gRPC protobuf definition shared by client and server.
- [tests/](tests/) - Catch2 regression tests and support targets.

## Roadmap

The current limitation is that SEAL does not run on-chain, so the matching engine still performs confidential matching off-chain. The next step is to port the matching logic into fhEVM Solidity using encrypted types such as `euint256` and helper operations such as `TFHE.eq()` so the matching decision can move onto chain while preserving confidentiality.

The current contract stub already documents that direction in [contracts/DarkPoolSettlement.sol](contracts/DarkPoolSettlement.sol) with fhEVM migration comments showing where `euint256` inputs and `TFHE.decrypt()` calls would replace the plain settlement arguments. Zama’s fhEVM documentation is here: https://docs.zama.org/fhevm and the Solidity examples are in the Zama fhEVM repository: https://github.com/zama-ai/fhevm.

## Technical Notes

### Transparent ciphertext via level misalignment

The CKKS sign polynomial step originally failed with a transparent ciphertext after a level mismatch. The root cause was that operands were being combined at different chain indices, which can leave the evaluator with an invalid intermediate state. The resolution was to align the operands to a common level before subtraction and sign evaluation, and then verify the depth invariant with a Catch2 test.

### `std::bad_alloc` via recursive squaring

The BFV equality path originally used a more aggressive recursive-squaring style evaluation and hit `std::bad_alloc` under the exact parameter set in this project. The practical root cause was that the intermediate ciphertext growth was too large for the chosen path and modulus budget. The fix was to replace that approach with a stable BFV equality implementation that preserves the exact semantics needed by the matching server and keeps memory usage bounded.

### Pybind11 + gRPC mutex deadlock

A first attempt at server-side replay protection used an embedded Python interpreter to call the Python nonce store from inside the gRPC service. That approach deadlocked in the gRPC/Python runtime interaction and caused the server socket to close during SubmitOrder handling. The resolution was to pivot the server replay guard to a native SQLite implementation and keep the Python nonce store on the client/test side, which preserved the required replay behavior without the runtime deadlock.
