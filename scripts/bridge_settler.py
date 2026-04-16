#!/usr/bin/env python3
"""Settlement bridge for submitting C++ match outputs to PrivaDEXDarkPoolFHEVM.

Usage examples:
  python3 scripts/bridge_settler.py --json /path/to/match_result.json
  python3 scripts/bridge_settler.py --log /path/to/matching_server.log
  python3 scripts/bridge_settler.py --order-a 1 --order-b 2
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Optional, Tuple

from web3 import Web3
from web3.contract import Contract

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    def load_dotenv() -> bool:
        return False

# Minimal ABI for bridge operations only.
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "orderAId", "type": "uint256"},
            {"internalType": "uint256", "name": "orderBId", "type": "uint256"},
            {"internalType": "bytes32", "name": "request_id", "type": "bytes32"},
        ],
        "name": "matchOrders",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
        "name": "settledRequestIds",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# Log patterns for matching_server output integration.
LOG_PATTERNS = [
    re.compile(r"OrderA\s*ID\s*[:=]\s*(\d+).+OrderB\s*ID\s*[:=]\s*(\d+)", re.IGNORECASE),
    re.compile(r"match_result\s*[:=].*order[_\s-]*a\s*[:=]\s*(\d+).+order[_\s-]*b\s*[:=]\s*(\d+)", re.IGNORECASE),
]


def load_web3() -> Tuple[Web3, str, str]:
    load_dotenv()

    rpc_url = os.getenv("RPC_URL", "http://127.0.0.1:8545")
    private_key = os.getenv("SETTLER_PRIVATE_KEY")
    contract_address = os.getenv("PRIVADEX_FHEVM_CONTRACT")

    if not private_key:
        raise RuntimeError("SETTLER_PRIVATE_KEY missing in environment/.env")
    if not contract_address:
        raise RuntimeError("PRIVADEX_FHEVM_CONTRACT missing in environment/.env")

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"cannot connect to RPC_URL={rpc_url}")

    return w3, private_key, Web3.to_checksum_address(contract_address)


def get_contract(w3: Web3, contract_address: str) -> Contract:
    return w3.eth.contract(address=contract_address, abi=CONTRACT_ABI)


def generate_request_id(order_a_id: int, order_b_id: int) -> bytes:
    # Unique bytes32 for replay-safe settlement attempts.
    payload = (
        f"{order_a_id}:{order_b_id}:{int(time.time_ns())}:{secrets.token_hex(16)}"
    ).encode("utf-8")
    return Web3.keccak(payload)


def parse_request_id(request_id: str) -> bytes:
    rid = request_id.strip().lower()
    if rid.startswith("0x"):
        rid = rid[2:]
    if not re.fullmatch(r"[0-9a-f]{64}", rid):
        raise ValueError("request_id must be 32-byte hex (64 hex chars, optional 0x prefix)")
    return bytes.fromhex(rid)


def parse_order_ids_from_log(log_path: Path) -> Optional[Tuple[int, int]]:
    text = log_path.read_text(encoding="utf-8", errors="replace")
    for line in reversed(text.splitlines()):
        for pattern in LOG_PATTERNS:
            match = pattern.search(line)
            if match:
                return int(match.group(1)), int(match.group(2))
    return None


def parse_order_ids_from_json(json_path: Path) -> Optional[Tuple[int, int]]:
    data = json.loads(json_path.read_text(encoding="utf-8"))

    # Expected bridge-friendly shapes.
    candidates = [
        ("order_a_id", "order_b_id"),
        ("orderAId", "orderBId"),
        ("order_a", "order_b"),
    ]

    for a_key, b_key in candidates:
        if a_key in data and b_key in data:
            return int(data[a_key]), int(data[b_key])

    if "match_result" in data and isinstance(data["match_result"], dict):
        nested = data["match_result"]
        for a_key, b_key in candidates:
            if a_key in nested and b_key in nested:
                return int(nested[a_key]), int(nested[b_key])

    return None


def submit_match(order_a_id: int, order_b_id: int, request_id: Optional[str] = None) -> str:
    w3, private_key, contract_address = load_web3()
    contract = get_contract(w3, contract_address)

    account = w3.eth.account.from_key(private_key)
    request_id_bytes = parse_request_id(request_id) if request_id else generate_request_id(order_a_id, order_b_id)

    # Pre-check replay mapping for defense in depth.
    if contract.functions.settledRequestIds(request_id_bytes).call():
        raise RuntimeError("Contract Revert: Duplicate request_id")

    tx = contract.functions.matchOrders(order_a_id, order_b_id, request_id_bytes).build_transaction(
        {
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "gas": int(os.getenv("SETTLER_GAS_LIMIT", "10000000")),
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        }
    )

    signed = account.sign_transaction(tx)
    raw_tx = getattr(signed, "raw_transaction", None)
    if raw_tx is None:
        raw_tx = getattr(signed, "rawTransaction")
    tx_hash = w3.eth.send_raw_transaction(raw_tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    if receipt.status != 1:
        raise RuntimeError(f"Contract Revert: tx={tx_hash.hex()}")

    print(
        "submitted match",
        json.dumps(
            {
                "tx_hash": tx_hash.hex(),
                "order_a_id": order_a_id,
                "order_b_id": order_b_id,
                "request_id": request_id_bytes.hex(),
                "block_number": receipt.blockNumber,
            },
            indent=2,
        ),
    )

    print(
        "BRIDGE_RESULT="
        + json.dumps(
            {
                "tx_hash": tx_hash.hex(),
                "order_a_id": order_a_id,
                "order_b_id": order_b_id,
                "request_id": request_id_bytes.hex(),
                "block_number": receipt.blockNumber,
            },
            separators=(",", ":"),
        )
    )

    return tx_hash.hex()


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit C++ match output to fhEVM matchOrders")
    parser.add_argument("--order-a", type=int, help="Order A ID")
    parser.add_argument("--order-b", type=int, help="Order B ID")
    parser.add_argument("--log", type=Path, help="Path to matching_server log to parse")
    parser.add_argument("--json", type=Path, help="Path to JSON output file to parse")
    parser.add_argument("--request-id", type=str, help="Optional bytes32 request_id hex (for replay checks)")
    args = parser.parse_args()

    order_ids: Optional[Tuple[int, int]] = None

    if args.order_a is not None and args.order_b is not None:
        order_ids = (args.order_a, args.order_b)
    elif args.json:
        order_ids = parse_order_ids_from_json(args.json)
    elif args.log:
        order_ids = parse_order_ids_from_log(args.log)

    if not order_ids:
        raise SystemExit(
            "Could not determine order IDs. Provide --order-a/--order-b, or a parseable --json/--log source."
        )

    submit_match(order_ids[0], order_ids[1], args.request_id)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
