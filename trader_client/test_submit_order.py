from __future__ import annotations

import contextlib
import os
import pathlib
import secrets
import subprocess
import sys
import tempfile

import grpc
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD_DIR = REPO_ROOT / "build"
SERVER_BINARY = BUILD_DIR / "matching_server"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from trader_client import OrderNonceStore, TraderClient
from trader_client.proto_runtime import darkpool_pb2


class FakeRpcError(grpc.RpcError):
    def __init__(self, status_code: grpc.StatusCode, message: str) -> None:
        super().__init__()
        self._status_code = status_code
        self._message = message

    def code(self):
        return self._status_code

    def details(self):
        return self._message


class FakeStub:
    def __init__(self, response: darkpool_pb2.MatchResponse | None = None, error: grpc.RpcError | None = None) -> None:
        self.response = response or darkpool_pb2.MatchResponse(
            is_error=False,
            result_ciphertext=b"ciphertext",
        )
        self.error = error
        self.requests = []

    def SubmitOrder(self, request, timeout=None):
        self.requests.append((request, timeout))
        if self.error is not None:
            raise self.error
        return self.response


@contextlib.contextmanager
def running_server(address: str = "127.0.0.1:50073"):
    if not SERVER_BINARY.exists():
        raise RuntimeError(f"matching_server binary not found at {SERVER_BINARY}")
    proc = subprocess.Popen([str(SERVER_BINARY), address], cwd=BUILD_DIR)
    channel = grpc.insecure_channel(address)
    grpc.channel_ready_future(channel).result(timeout=15)
    try:
        yield proc
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


@contextlib.contextmanager
def running_server_with_nonce_db(db_path: pathlib.Path, address: str = "127.0.0.1:50073"):
    if not SERVER_BINARY.exists():
        raise RuntimeError(f"matching_server binary not found at {SERVER_BINARY}")

    env = os.environ.copy()
    env["DARKPOOL_NONCE_DB"] = str(db_path)

    proc = subprocess.Popen([str(SERVER_BINARY), address], cwd=BUILD_DIR, env=env)
    channel = grpc.insecure_channel(address)
    grpc.channel_ready_future(channel).result(timeout=15)
    try:
        yield proc
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


def test_submit_order_valid_buy():
    stub = FakeStub()
    client = TraderClient(stub=stub)
    result = client.submit_order("trader-a", 100, 25, "BUY", nonce=b"0123456789abcdef")

    assert result.success is True
    assert result.match_found is True
    assert result.encrypted_result == b"ciphertext"
    assert result.error is None
    assert stub.requests
    request, timeout = stub.requests[0]
    assert request.trader_id == "trader-a"
    assert request.nonce == b"0123456789abcdef"
    assert timeout is None


def test_submit_order_valid_sell():
    stub = FakeStub()
    client = TraderClient(stub=stub)
    result = client.submit_order("trader-b", 101, 30, "SELL", nonce=b"fedcba9876543210")

    assert result.success is True
    assert result.match_found is True
    assert result.encrypted_result == b"ciphertext"
    assert result.error is None


@pytest.mark.parametrize(
    "price, quantity, side",
    [
        (0, 10, "BUY"),
        ((1 << 20) + 1, 10, "BUY"),
        (100, 0, "SELL"),
        (100, (1 << 20) + 1, "SELL"),
    ],
)
def test_submit_order_invalid_price_or_quantity(price, quantity, side):
    client = TraderClient(stub=FakeStub())
    with pytest.raises(ValueError):
        client.submit_order("trader-c", price, quantity, side, nonce=b"0011223344556677")


def test_submit_order_missing_field():
    client = TraderClient(stub=FakeStub())
    with pytest.raises(ValueError):
        client.submit_order("", 100, 10, "BUY", nonce=b"0011223344556677")


def test_submit_order_replay_returns_already_exists():
    address = "127.0.0.1:50073"
    with running_server(address):
        client = TraderClient(server_address=address)
        nonce = secrets.token_bytes(16)
        first = client.submit_order("trader-replay", 100, 10, "BUY", nonce=nonce)
        assert first.success is True

        with pytest.raises(grpc.RpcError) as excinfo:
            client.submit_order("trader-replay", 100, 10, "BUY", nonce=nonce)

        assert excinfo.value.code() == grpc.StatusCode.ALREADY_EXISTS


def test_submit_order_replay_persists_across_restart():
    address = "127.0.0.1:50073"
    with tempfile.TemporaryDirectory() as tmp:
        db_path = pathlib.Path(tmp) / "nonce_store.sqlite"
        nonce = b"2011223344556677"

        with running_server_with_nonce_db(db_path, address):
            client = TraderClient(server_address=address)
            first = client.submit_order("trader-replay", 100, 10, "BUY", nonce=nonce)
            assert first.success is True

        with running_server_with_nonce_db(db_path, address):
            client = TraderClient(server_address=address)
            with pytest.raises(grpc.RpcError) as excinfo:
                client.submit_order("trader-replay", 100, 10, "BUY", nonce=nonce)
            assert excinfo.value.code() == grpc.StatusCode.ALREADY_EXISTS


def test_submit_order_internal_error_propagates():
    stub = FakeStub(error=FakeRpcError(grpc.StatusCode.INTERNAL, "server fault"))
    client = TraderClient(stub=stub)

    with pytest.raises(grpc.RpcError) as excinfo:
        client.submit_order("trader-d", 100, 10, "BUY", nonce=b"8899aabbccddeeff")

    assert excinfo.value.code() == grpc.StatusCode.INTERNAL


def test_nonce_store_expired_nonce_rejected():
    store = OrderNonceStore(expiry_seconds=300, now_fn=lambda: 1_000)
    assert store.insert_nonce(b"0123456789abcdef", "trader-expired", timestamp=600) is False
