# MEV Surface Analysis (PrivaDEX DarkPool)

## Objective
Assess where front-running and order-information leakage can still occur in the current architecture.

## What Is Protected
- Bid/ask/qty values are encrypted before reaching matching service.
- Matching server does not hold secret keys.
- Equality/sign computations occur over ciphertexts.

## Remaining Observable Metadata Surface
- Network metadata (request timing, size, source identity).
- Trader/account linkage outside encrypted payload fields.
- Settlement timing and public on-chain event visibility.

## Mitigations in Current Design
- Slot blinding to reduce slot correlation risk.
- Dummy-order protocol and fixed-cadence windowing in threat model.
- Replay protection with durable nonce store.
- Server-enforced pool scheme policy by pool_id.

## Threat Mapping (Spec T-01..T-08)
- T-01/T-02/T-03: mitigated by encrypted payload pipeline and key custody model.
- T-04: mitigated by slot blinding.
- T-05/T-08: mitigated by cadence/dummy-order strategy.
- T-06: mitigated by nonce replay gate.
- T-07: mitigated by parameter-id checks.

## Conclusion
The project significantly reduces plaintext MEV extraction opportunities during matching compared with transparent mempool matching, while acknowledging residual metadata leakage that is outside ciphertext arithmetic and requires protocol-level scheduling/network countermeasures.
