#!/usr/bin/env python3
"""Deploy PrivaDEXDarkPoolFHEVM to a local Hardhat node (idempotent).

Prints shell-compatible KEY=VALUE lines for use by Makefile/test runners.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from web3 import Web3

DEFAULT_RPC_URL = "http://127.0.0.1:8545"
# Hardhat default account #0 private key.
DEFAULT_SETTLER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ARTIFACT_PATH = Path("artifacts/contracts/PrivaDEXDarkPool.fhEVM.sol/PrivaDEXDarkPoolFHEVM.json")


def main() -> None:
    rpc_url = os.getenv("RPC_URL", DEFAULT_RPC_URL)
    private_key = os.getenv("SETTLER_PRIVATE_KEY", DEFAULT_SETTLER_PRIVATE_KEY)

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise SystemExit(f"RPC not reachable at {rpc_url}")

    if not ARTIFACT_PATH.exists():
        raise SystemExit(f"Missing artifact: {ARTIFACT_PATH}")

    artifact = json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))
    abi = artifact["abi"]
    bytecode = artifact["bytecode"]

    acct = w3.eth.account.from_key(private_key)
    existing = os.getenv("PRIVADEX_FHEVM_CONTRACT", "")

    contract_address = ""
    if existing:
        try:
            checksum = Web3.to_checksum_address(existing)
            if w3.eth.get_code(checksum):
                contract_address = checksum
        except Exception:
            contract_address = ""

    if not contract_address:
        contract = w3.eth.contract(abi=abi, bytecode=bytecode)
        tx = contract.constructor().build_transaction(
            {
                "from": acct.address,
                "nonce": w3.eth.get_transaction_count(acct.address),
                "gas": 9_000_000,
                "gasPrice": w3.eth.gas_price,
                "chainId": w3.eth.chain_id,
            }
        )
        signed = acct.sign_transaction(tx)
        raw_tx = getattr(signed, "raw_transaction", None)
        if raw_tx is None:
            raw_tx = getattr(signed, "rawTransaction")
        tx_hash = w3.eth.send_raw_transaction(raw_tx)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status != 1:
            raise SystemExit(f"Deployment failed: {tx_hash.hex()}")
        contract_address = receipt.contractAddress

    print(f"RPC_URL={rpc_url}")
    print(f"SETTLER_PRIVATE_KEY={private_key}")
    print(f"PRIVADEX_FHEVM_CONTRACT={contract_address}")


if __name__ == "__main__":
    main()
