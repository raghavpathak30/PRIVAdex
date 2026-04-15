# fhEVM Migration Notes

These notes expand the migration stubs in [contracts/DarkPoolSettlement.sol](contracts/DarkPoolSettlement.sol) and document the intended Zama-facing path.

## Current settlement stub

```solidity
function settle(
    address trader,
    uint256 price,
    uint256 quantity,
    bool isBuy
) external onlyAuthorizedSettler {
    Settlement memory settlement = Settlement({
        price: price,
        quantity: quantity,
        isBuy: isBuy,
        timestamp: block.timestamp
    });
    settlements[trader].push(settlement);
    emit OrderSettled(trader, price, quantity, isBuy, block.timestamp);
}
```

## Migration note 1: encrypted price input

In the SEAL-based version, `price` arrives as a plaintext integer after decryption in the Python settlement bridge. The bridge decides whether the result is a match, decrypts the BFV payload, and then forwards the clear integer to the settlement contract. In fhEVM, this becomes an encrypted input such as `euint256 encPrice`, and the contract receives the encrypted handle directly. The API change is that the contract no longer receives a plaintext `uint256` price from an off-chain bridge; instead, it consumes an encrypted integer and uses `TFHE.decrypt()` only at the point where a clear settlement decision or stored record is intentionally needed.

## Migration note 2: encrypted quantity input

The current system decrypts `quantity` in Python and passes it to `settle()` as a regular `uint256`. That is a useful staging step, but it still leaves the settlement bridge responsible for plaintext extraction. In fhEVM, the settlement function would accept `euint256 encQuantity`, keeping the quantity encrypted inside the contract boundary. The main API difference is that arithmetic or equality checks happen through fhEVM helpers rather than SEAL ciphertext math on the client side.

## Migration note 3: equality and comparison operations

The SEAL code path currently relies on BFV equality evaluation off-chain to determine whether a match exists. In fhEVM, the equivalent logic would be expressed with `TFHE.eq()` over encrypted values, producing an encrypted boolean or encrypted condition that the contract can use for branching or authorization. Zama’s fhEVM Solidity examples use `euint256` and `FHE.eq(...)` / `TFHE.eq(...)` style encrypted comparisons, which makes the intended port straightforward: the contract keeps the same high-level meaning, but the comparison executes natively on-chain over encrypted values instead of in the off-chain engine.

## Migration note 4: decryption boundary

In the current bridge, decryption is performed in Python with the SEAL wrapper before settlement is sent on chain. That means the off-chain bridge sees the plaintext match details. In fhEVM, the equivalent decryption point would be `TFHE.decrypt()` inside the contract or within an authorized on-chain flow, depending on the final confidentiality model. The API change matters because the decryption authority moves from the Python bridge to the confidential contract environment, reducing the trust placed on the bridge.

## Migration note 5: authorization model

Today the settlement contract checks an `authorizedSettler` address and accepts plaintext settlement parameters. The fhEVM version should preserve that role check so the migration is behaviorally stable for callers. The difference is that the authorized settler would submit encrypted values and a proof/input bundle rather than plaintext integers, but the external interface still expresses the same settlement intent and event emission shape.

## Zama references

- fhEVM landing page: https://docs.zama.org/fhevm
- Zama fhEVM repository: https://github.com/zama-ai/fhevm
- Solidity guide examples: https://docs.zama.org/homepage#zama-confidential-blockchain-protocol
