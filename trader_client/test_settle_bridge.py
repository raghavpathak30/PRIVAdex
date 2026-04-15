from __future__ import annotations

import pathlib
import sys

import grpc
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from trader_client import SubmitOrderResult
from trader_client.settle_bridge import SettlementError, settle_match_result, settle_on_chain


class FakeReceipt:
    def __init__(self, status: int = 1) -> None:
        self.status = status


class FakeSignedTx:
    def __init__(self) -> None:
        self.rawTransaction = b"rawtx"


class FakeAccount:
    def __init__(self) -> None:
        self.address = "0x1111111111111111111111111111111111111111"

    def sign_transaction(self, tx):
        return FakeSignedTx()


class FakeFunctionCall:
    def __init__(self, calls, revert=False):
        self._calls = calls
        self._revert = revert

    def build_transaction(self, params):
        self._calls.append(params)
        return {"to": "0x2222222222222222222222222222222222222222", "data": b"call"}


class FakeContractFunctions:
    def __init__(self, calls, revert=False):
        self._calls = calls
        self._revert = revert

    def settle(self, trader, price, quantity, is_buy):
        self._calls.append((trader, price, quantity, is_buy))
        return FakeFunctionCall(self._calls, revert=self._revert)


class FakeContract:
    def __init__(self, calls, revert=False):
        self.functions = FakeContractFunctions(calls, revert=revert)


class FakeEth:
    def __init__(self, calls, revert=False):
        self.account = FakeAccount()
        self._calls = calls
        self._revert = revert

    def contract(self, address, abi):
        self._calls.append((address, abi))
        return FakeContract(self._calls, revert=self._revert)

    def get_transaction_count(self, address):
        return 7

    def send_raw_transaction(self, raw):
        return b"\xaa" * 32

    def send_transaction(self, tx):
        return b"\xbb" * 32

    def wait_for_transaction_receipt(self, tx_hash):
        return FakeReceipt(status=0 if self._revert else 1)


class FakeWeb3:
    def __init__(self, revert=False):
        self.calls = []
        self.eth = FakeEth(self.calls, revert=revert)

    def is_connected(self):
        return True

    def to_checksum_address(self, value):
        return value


def test_valid_match_result_calls_settle_on_chain(monkeypatch, tmp_path):
    result = SubmitOrderResult(
        success=True,
        match_found=True,
        encrypted_result=b"ciphertext",
        error=None,
        trader_id="0x3333333333333333333333333333333333333333",
        price=100,
        quantity=10,
        side="BUY",
        use_bfv=True,
    )

    monkeypatch.setattr("trader_client.settle_bridge.decrypt_match_result", lambda _: (321, 12))
    captured = {}

    def fake_settle_on_chain(trader_id, price, quantity, is_buy, config_path=None, web3_client=None):
        captured["args"] = (trader_id, price, quantity, is_buy)
        return "0xabc"

    monkeypatch.setattr("trader_client.settle_bridge.settle_on_chain", fake_settle_on_chain)

    tx_hash = settle_match_result(result, config_path=tmp_path / "settlement_config.json")

    assert tx_hash == "0xabc"
    assert captured["args"] == (result.trader_id, 321, 12, True)


def test_match_found_false_skips_settlement(monkeypatch, tmp_path):
    result = SubmitOrderResult(success=True, match_found=False, encrypted_result=None, error=None)
    called = {"count": 0}

    def fake_settle_on_chain(*args, **kwargs):
        called["count"] += 1
        return "0xabc"

    monkeypatch.setattr("trader_client.settle_bridge.settle_on_chain", fake_settle_on_chain)

    assert settle_match_result(result, config_path=tmp_path / "settlement_config.json") is None
    assert called["count"] == 0


def test_decryption_failure_raises_settlement_error(monkeypatch, tmp_path):
    result = SubmitOrderResult(
        success=True,
        match_found=True,
        encrypted_result=b"ciphertext",
        error=None,
        trader_id="0x3333333333333333333333333333333333333333",
        side="BUY",
        use_bfv=True,
    )

    monkeypatch.setattr(
        "trader_client.settle_bridge.decrypt_match_result",
        lambda _: (_ for _ in ()).throw(SettlementError("decrypt failed", "decrypt")),
    )

    with pytest.raises(SettlementError) as excinfo:
        settle_match_result(result, config_path=tmp_path / "settlement_config.json")

    assert excinfo.value.stage == "decrypt"


def test_web3_revert_raises_settlement_error(monkeypatch, tmp_path):
    config_path = tmp_path / "settlement_config.json"
    config_path.write_text(
        '{"contract_address": "0x2222222222222222222222222222222222222222", "abi": [], "rpc_url": "http://localhost:8545"}',
        encoding="utf-8",
    )
    fake_web3 = FakeWeb3(revert=True)

    with pytest.raises(SettlementError) as excinfo:
        settle_on_chain(
            "0x3333333333333333333333333333333333333333",
            100,
            10,
            True,
            config_path=config_path,
            web3_client=fake_web3,
        )

    assert excinfo.value.stage == "tx_revert"
