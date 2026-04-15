from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .backend.load_wrapper import load_seal_wrapper
from .trader_client import SubmitOrderResult


LOGGER = logging.getLogger(__name__)
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = REPO_ROOT / "settlement_config.json"


class SettlementError(RuntimeError):
    def __init__(self, message: str, stage: str) -> None:
        super().__init__(message)
        self.stage = stage


def _load_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        raise SettlementError(f"settlement config not found: {path}", "encode")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not data.get("contract_address"):
        raise SettlementError("missing settlement contract address", "encode")
    abi = data.get("abi")
    if not isinstance(abi, list):
        raise SettlementError("invalid settlement ABI", "encode")
    return data


def decrypt_match_result(result: SubmitOrderResult) -> tuple[int, int]:
    try:
        if result.encrypted_result is None:
            raise ValueError("missing encrypted result")
        if result.use_bfv is False:
            raise ValueError("match result is not BFV encoded")
        wrapper = load_seal_wrapper()
        wrapper.init_contexts()
        decoded = wrapper.decrypt_bfv_layout(result.encrypted_result)
        if len(decoded) < 2:
            raise ValueError("decoded settlement payload is too short")
        return int(decoded[0]), int(decoded[1])
    except SettlementError:
        raise
    except Exception as exc:  # pragma: no cover - exercised through wrapped errors in tests
        raise SettlementError(str(exc), "decrypt") from exc


def settle_on_chain(
    trader_id: str,
    price: int,
    quantity: int,
    is_buy: bool,
    config_path: str | Path = DEFAULT_CONFIG_PATH,
    web3_client: Any | None = None,
) -> str:
    try:
        config = _load_config(config_path)
        rpc_url = config.get("rpc_url") or os.environ.get("SETTLEMENT_RPC_URL", "http://localhost:8545")
        private_key = config.get("private_key") or os.environ.get("SETTLEMENT_PRIVATE_KEY", "")

        if web3_client is None:
            from web3 import Web3

            web3_client = Web3(Web3.HTTPProvider(rpc_url))

        if not web3_client.is_connected():
            raise SettlementError("web3 provider is not connected", "tx_submit")

        contract = web3_client.eth.contract(
            address=web3_client.to_checksum_address(config["contract_address"]),
            abi=config["abi"],
        )

        account = None
        if private_key:
            account = web3_client.eth.account.from_key(private_key)

        tx_params = {}
        if account is not None:
            tx_params["from"] = account.address
            tx_params["nonce"] = web3_client.eth.get_transaction_count(account.address)

        built_tx = contract.functions.settle(
            web3_client.to_checksum_address(trader_id),
            int(price),
            int(quantity),
            bool(is_buy),
        ).build_transaction(tx_params)

        if account is not None:
            signed_tx = account.sign_transaction(built_tx)
            tx_hash = web3_client.eth.send_raw_transaction(signed_tx.rawTransaction)
        else:
            tx_hash = web3_client.eth.send_transaction(built_tx)

        receipt = web3_client.eth.wait_for_transaction_receipt(tx_hash)
        if getattr(receipt, "status", 1) != 1:
            raise SettlementError("settlement transaction reverted", "tx_revert")

        if isinstance(tx_hash, bytes):
            return "0x" + tx_hash.hex()
        return str(tx_hash)
    except SettlementError:
        raise
    except Exception as exc:
        message = str(exc)
        if "revert" in message.lower():
            raise SettlementError(message, "tx_revert") from exc
        raise SettlementError(message, "tx_submit") from exc


def settle_match_result(
    result: SubmitOrderResult,
    config_path: str | Path = DEFAULT_CONFIG_PATH,
    web3_client: Any | None = None,
) -> str | None:
    if not result.match_found or result.encrypted_result is None:
        LOGGER.info("No settlement needed for request %s", result.trader_id)
        return None

    price, quantity = decrypt_match_result(result)
    if result.trader_id is None or result.side is None:
        raise SettlementError("missing settlement metadata on submit order result", "encode")

    return settle_on_chain(
        result.trader_id,
        price,
        quantity,
        result.side == "BUY",
        config_path=config_path,
        web3_client=web3_client,
    )
