from __future__ import annotations

import argparse
import json
from pathlib import Path


CONTRACT_PATH = Path(__file__).resolve().with_name("DarkPoolSettlement.sol")
CONFIG_PATH = Path(__file__).resolve().parents[1] / "settlement_config.json"


def _compile_contract():
    from solcx import compile_standard, install_solc, set_solc_version

    install_solc("0.8.20")
    set_solc_version("0.8.20")

    source = CONTRACT_PATH.read_text(encoding="utf-8")
    compiled = compile_standard(
        {
            "language": "Solidity",
            "sources": {CONTRACT_PATH.name: {"content": source}},
            "settings": {
                "outputSelection": {
                    "*": {
                        "*": ["abi", "evm.bytecode.object"],
                    }
                }
            },
        }
    )
    contract_data = compiled["contracts"][CONTRACT_PATH.name]["DarkPoolSettlement"]
    return contract_data["abi"], contract_data["evm"]["bytecode"]["object"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Deploy DarkPoolSettlement.sol")
    parser.add_argument("--rpc-url", default="http://localhost:8545")
    parser.add_argument("--private-key", required=True)
    parser.add_argument("--config-path", default=str(CONFIG_PATH))
    args = parser.parse_args()

    from web3 import Web3

    abi, bytecode = _compile_contract()
    web3_client = Web3(Web3.HTTPProvider(args.rpc_url))
    if not web3_client.is_connected():
        raise SystemExit(f"Failed to connect to {args.rpc_url}")

    account = web3_client.eth.account.from_key(args.private_key)
    contract = web3_client.eth.contract(abi=abi, bytecode=bytecode)
    tx = contract.constructor(account.address).build_transaction(
        {
            "from": account.address,
            "nonce": web3_client.eth.get_transaction_count(account.address),
            "chainId": web3_client.eth.chain_id,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = web3_client.eth.send_raw_transaction(signed.rawTransaction)
    receipt = web3_client.eth.wait_for_transaction_receipt(tx_hash)
    contract_address = receipt.contractAddress

    config_path = Path(args.config_path)
    config_path.write_text(
        json.dumps(
            {
                "contract_address": contract_address,
                "abi": abi,
                "rpc_url": args.rpc_url,
                "authorized_settler": account.address,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(contract_address)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
