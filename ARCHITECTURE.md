# Architecture

## CKKSContextDP / BFVContextDP

`CKKSContextDP` and `BFVContextDP` are the SEAL context wrappers that define the cryptographic parameters for the two execution paths. CKKS is used for approximate arithmetic on real-valued prices and quantities, while BFV is used for exact integer matching. The contexts own the SEAL objects needed by the rest of the pipeline, including the encoder, encryptor, decryptor, evaluator, relinearization keys, and Galois keys, so the higher layers do not need to re-create cryptographic state per request.

## SignPolyEval (degree-27 Minimax PS)

`sign_poly_eval_d27` is the CKKS-side sign approximation kernel. It evaluates a degree-27 minimax polynomial over a ciphertext difference so that the engine can derive a match decision from an encrypted price delta without decrypting intermediate values. In this project it is the higher-depth CKKS path and is used when the order values are floating-point or otherwise routed through approximate arithmetic.

## BFVEqualityEval

`bfv_equality_eval` is the exact integer comparison kernel. It evaluates whether two integer-encoded slots are equal and returns a ciphertext whose decoded value reflects the equality result. In the current server implementation this is the kernel used for the replay-guarded matching path, because it is stable, exact, and easier to validate in tests than the approximate path.

## SlotBlinding

`SlotBlinding` provides ciphertext rotation-based blinding and unblinding helpers. Its purpose is to make the slot pattern less obvious while preserving the post-processing semantics of the matching result. The implementation is intentionally conservative: it uses offsets backed by the available Galois keys and falls back safely if a rotation key is unavailable.

## MatchingServer

`MatchingServer` is the gRPC service boundary. It exposes `ExecuteMatch` for the existing matching benchmark path and `SubmitOrder` for the replay-protected order flow. The service deserializes ciphertext payloads, dispatches the appropriate CKKS or BFV kernel, serializes the result back into protobuf bytes, and returns a status code that can be checked by the caller.

## NonceStore (native SQLite replay guard)

`NonceStore` is the server-side replay guard implemented with native SQLite. It stores nonces in a `nonce BLOB PRIMARY KEY, trader_id TEXT, timestamp INTEGER` table and rejects duplicates so that a replayed order does not get processed twice. The guard is intentionally simple and local: it protects against duplicate submissions at the server boundary, but it is not a global consensus mechanism.

## TraderClient

`TraderClient` is the Python entry point for order submission. It validates the contract fields, chooses the encryption scheme, packs the order into the SEAL wrapper layout, encrypts the order, generates or accepts a nonce, and sends a gRPC `SubmitOrder` request. The client also exposes a typed `SubmitOrderResult` dataclass so the rest of the Python workflow can tell the difference between success, match absence, and transport/server failures.

## SettleBridge

`settle_bridge.py` is the post-match Python bridge. It takes a `SubmitOrderResult`, decrypts BFV results through the Pybind11 wrapper, extracts the matched price and quantity, and calls `settle_on_chain()` when a match exists. The bridge is designed to propagate errors explicitly through `SettlementError` with a stage label so callers can tell whether the failure happened during decryption, encoding, transaction submission, or transaction revert handling.

## DarkPoolSettlement.sol

`DarkPoolSettlement.sol` is the on-chain settlement stub. It stores settlement records, emits an `OrderSettled` event, and restricts `settle()` to an authorized settler address. The contract is intentionally simple and stable so it can survive a later fhEVM migration: the current public shape can remain while the internal representation of the order payload moves from plaintext integers to encrypted `euint256` inputs and `TFHE` operations.

## Data Flow

A trader submits price, quantity, side, and trader identity to `TraderClient`. The client validates the fields, generates or accepts a 16-byte nonce, encrypts the order with the chosen scheme, and sends a gRPC `SubmitOrder` request to `MatchingServer`. The server checks the nonce against the SQLite replay store and rejects duplicates with `ALREADY_EXISTS` before doing any matching work.

If the nonce is new, the server deserializes the ciphertexts, runs BFV equality evaluation for the current matching path, applies slot blinding, serializes the result, and returns it in the response. The client receives the response, decrypts it if needed through the Pybind11 wrapper, and creates a `SubmitOrderResult`. If `match_found` is true, `settle_bridge.py` decrypts the BFV result, extracts price and quantity, and calls `settle_on_chain()`, which submits the settlement transaction to `DarkPoolSettlement.sol`. The contract records the settlement and emits `OrderSettled`.

## Security Properties

The design protects order price and quantity during the matching step because the engine only sees ciphertexts. It does not hide trader identity end-to-end, because the trader ID, request metadata, timing, and settlement call all remain visible to the server, the client logs, and the on-chain settlement layer. Replay protection only covers duplicate nonce submissions at the server boundary; it does not prevent an attacker from learning that a request was attempted, and it does not provide global cross-server deduplication.

## Known Limitations and Future Work

The main limitation is that SEAL does not execute on-chain, so the confidentiality guarantee depends on an off-chain matching service. fhEVM removes that trust gap by moving the arithmetic into encrypted Solidity using types such as `euint256` and functions such as `TFHE.eq()` and `TFHE.decrypt()`. The current system also matches single order pairs rather than a true batch auction; extending it to a production dark pool would require a richer auction mechanism, stronger fairness properties, and more explicit settlement policy.
