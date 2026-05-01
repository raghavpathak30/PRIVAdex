from __future__ import annotations

from dataclasses import dataclass
import secrets
import threading
import time
from numbers import Integral
from typing import Sequence

import grpc
import numpy as np

try:
    from .order_nonce_store import OrderNonceStore
    from .proto_runtime import darkpool_pb2, darkpool_pb2_grpc
    from .backend.load_wrapper import load_seal_wrapper
except ImportError:
    from order_nonce_store import OrderNonceStore
    from proto_runtime import darkpool_pb2, darkpool_pb2_grpc
    from backend.load_wrapper import load_seal_wrapper


ORDERS_PER_BATCH = 16
STRIDE = 512
ASK_OFFSET = 256
CKKS_TOTAL_SLOTS = 8192
BFV_TOTAL_SLOTS = 16384
DUMMY_REQUEST_PREFIX = "dummy"


@dataclass
class EncryptedOrder:
    ciphertext: bytes
    use_bfv: bool
    ciphertext_size_bytes: int


@dataclass(frozen=True)
class SubmitOrderResult:
    success: bool
    match_found: bool
    encrypted_result: bytes | None
    error: str | None
    trader_id: str | None = None
    price: int | None = None
    quantity: int | None = None
    side: str | None = None
    nonce: bytes | None = None
    use_bfv: bool | None = None
    is_dummy: bool = False


class DummyManager:
    def __init__(
        self,
        client: "TraderClient",
        trader_id: str,
        cadence_ms: int = 5000,
        timeout_seconds: float | None = 5.0,
    ) -> None:
        if cadence_ms <= 0:
            raise ValueError("cadence_ms must be > 0")
        if not isinstance(trader_id, str) or not trader_id.strip():
            raise ValueError("trader_id must be a non-empty string")

        self._client = client
        self._trader_id = trader_id
        self._cadence_seconds = cadence_ms / 1000.0
        self._timeout_seconds = timeout_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._sent = 0
        self._last_error: Exception | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="dummy-cadence", daemon=True)
        self._thread.start()

    def stop(self, join_timeout_seconds: float = 2.0) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=join_timeout_seconds)

    @property
    def sent_count(self) -> int:
        with self._lock:
            return self._sent

    @property
    def last_error(self) -> Exception | None:
        with self._lock:
            return self._last_error

    def _run_loop(self) -> None:
        # Wait for cadence interval before each heartbeat to produce deterministic
        # cadence counts (duration / cadence).
        while not self._stop_event.wait(self._cadence_seconds):
            try:
                result = self._client.submit_dummy_order(
                    trader_id=self._trader_id,
                    timeout_seconds=self._timeout_seconds,
                )
                if result.success:
                    with self._lock:
                        self._sent += 1
            except Exception as exc:
                with self._lock:
                    self._last_error = exc


class TraderClient:
    def __init__(
        self,
        server_address: str | None = None,
        stub: object | None = None,
        nonce_store: OrderNonceStore | None = None,
    ) -> None:
        self._wrapper = load_seal_wrapper()
        self._wrapper.init_contexts()
        self._server_address = server_address
        self._stub = stub
        self._channel = None
        self._nonce_store = nonce_store or OrderNonceStore()

    @staticmethod
    def _is_integer_price_path(bids: Sequence[float], asks: Sequence[float]) -> bool:
        def _all_int(values: Sequence[float]) -> bool:
            return all(isinstance(v, Integral) for v in values)

        return _all_int(bids) and _all_int(asks)

    @staticmethod
    def _validate_inputs(
        bids: Sequence[float],
        asks: Sequence[float],
        qtys: Sequence[float],
    ) -> int:
        n_orders = len(bids)
        if not (1 <= n_orders <= ORDERS_PER_BATCH):
            raise ValueError("n_orders must be in [1,16]")
        if len(asks) != n_orders or len(qtys) != n_orders:
            raise ValueError("bids/asks/qtys must have identical lengths")
        return n_orders

    @staticmethod
    def _encode_ckks_layout(
        bids: Sequence[float],
        asks: Sequence[float],
        qtys: Sequence[float],
    ) -> np.ndarray:
        tiled = np.zeros(CKKS_TOTAL_SLOTS, dtype=np.float64)
        for k, (bid, ask, qty) in enumerate(zip(bids, asks, qtys)):
            base = k * STRIDE
            tiled[base + 0] = float(bid)
            tiled[base + 1] = float(qty)
            tiled[base + ASK_OFFSET] = float(ask)
        return np.ascontiguousarray(tiled)

    @staticmethod
    def _encode_bfv_layout(
        bids: Sequence[float],
        asks: Sequence[float],
        qtys: Sequence[float],
    ) -> np.ndarray:
        tiled = np.zeros(BFV_TOTAL_SLOTS, dtype=np.uint64)
        for k, (bid, ask, qty) in enumerate(zip(bids, asks, qtys)):
            base = k * STRIDE
            tiled[base + 0] = np.uint64(int(bid))
            tiled[base + 1] = np.uint64(int(qty))
            tiled[base + ASK_OFFSET] = np.uint64(int(ask))
        return np.ascontiguousarray(tiled)

    def encrypt_order(
        self,
        bids: Sequence[float],
        asks: Sequence[float],
        qtys: Sequence[float],
    ) -> EncryptedOrder:
        self._validate_inputs(bids, asks, qtys)
        use_bfv = self._is_integer_price_path(bids, asks)

        if use_bfv:
            packed = self._encode_bfv_layout(bids, asks, qtys)
            ct = self._wrapper.encrypt_bfv_layout(packed)
        else:
            packed = self._encode_ckks_layout(bids, asks, qtys)
            ct = self._wrapper.encrypt_ckks_layout(packed)

        return EncryptedOrder(
            ciphertext=bytes(ct),
            use_bfv=use_bfv,
            ciphertext_size_bytes=len(ct),
        )

    @staticmethod
    def _validate_submit_order(
        trader_id: str,
        price: int,
        quantity: int,
        side: str,
        nonce: bytes,
    ) -> None:
        if not isinstance(trader_id, str) or not trader_id.strip():
            raise ValueError("trader_id must be a non-empty string")
        if not isinstance(price, Integral) or isinstance(price, bool) or not (1 <= int(price) <= (1 << 20)):
            raise ValueError("price must be an int in [1, 2^20]")
        if not isinstance(quantity, Integral) or isinstance(quantity, bool) or not (1 <= int(quantity) <= (1 << 20)):
            raise ValueError("quantity must be an int in [1, 2^20]")
        if side not in {"BUY", "SELL"}:
            raise ValueError('side must be "BUY" or "SELL"')
        if not isinstance(nonce, (bytes, bytearray, memoryview)) or len(bytes(nonce)) != 16:
            raise ValueError("nonce must be exactly 16 bytes")

    def _resolve_stub(self):
        if self._stub is not None:
            return self._stub
        if self._server_address is None:
            raise RuntimeError("submit_order requires a gRPC stub or server_address")
        if self._channel is None:
            self._channel = grpc.insecure_channel(self._server_address)
            self._stub = darkpool_pb2_grpc.MatchingServiceStub(self._channel)
        return self._stub

    def submit_order(
        self,
        trader_id: str,
        price: int,
        quantity: int,
        side: str,
        nonce: bytes | None = None,
        timeout_seconds: float | None = None,
    ) -> SubmitOrderResult:
        return self._submit_order_internal(
            trader_id=trader_id,
            price=price,
            quantity=quantity,
            side=side,
            nonce=nonce,
            timeout_seconds=timeout_seconds,
            allow_zero=False,
            is_dummy=False,
        )

    def submit_dummy_order(
        self,
        trader_id: str,
        side: str | None = None,
        nonce: bytes | None = None,
        timeout_seconds: float | None = None,
    ) -> SubmitOrderResult:
        if side is None:
            side = "BUY" if (time.time_ns() & 1) == 0 else "SELL"
        return self._submit_order_internal(
            trader_id=trader_id,
            price=0,
            quantity=0,
            side=side,
            nonce=nonce,
            timeout_seconds=timeout_seconds,
            allow_zero=True,
            is_dummy=True,
        )

    def _submit_order_internal(
        self,
        trader_id: str,
        price: int,
        quantity: int,
        side: str,
        nonce: bytes | None,
        timeout_seconds: float | None,
        allow_zero: bool,
        is_dummy: bool,
    ) -> SubmitOrderResult:
        auto_nonce = nonce is None
        if nonce is None:
            nonce = secrets.token_bytes(16)

        if allow_zero:
            if not isinstance(trader_id, str) or not trader_id.strip():
                raise ValueError("trader_id must be a non-empty string")
            if not isinstance(price, Integral) or isinstance(price, bool) or not (0 <= int(price) <= (1 << 20)):
                raise ValueError("dummy price must be an int in [0, 2^20]")
            if not isinstance(quantity, Integral) or isinstance(quantity, bool) or not (0 <= int(quantity) <= (1 << 20)):
                raise ValueError("dummy quantity must be an int in [0, 2^20]")
            if side not in {"BUY", "SELL"}:
                raise ValueError('side must be "BUY" or "SELL"')
            if not isinstance(nonce, (bytes, bytearray, memoryview)) or len(bytes(nonce)) != 16:
                raise ValueError("nonce must be exactly 16 bytes")
        else:
            self._validate_submit_order(trader_id, price, quantity, side, bytes(nonce))

        if auto_nonce:
            while not self._nonce_store.insert_nonce(nonce, trader_id):
                nonce = secrets.token_bytes(16)

        if side == "BUY":
            bids = [int(price)]
            asks = [0]
        else:
            bids = [0]
            asks = [int(price)]

        buy_encrypted = self.encrypt_order(bids, asks, [int(quantity)])
        sell_encrypted = self.encrypt_order(bids, asks, [int(quantity)])
        request_id_prefix = DUMMY_REQUEST_PREFIX if is_dummy else trader_id
        request = darkpool_pb2.MatchRequest(
            buy_order=buy_encrypted.ciphertext,
            sell_order=sell_encrypted.ciphertext,
            request_id=f"{request_id_prefix}:{trader_id}:{bytes(nonce).hex()}",
            pool_id="default",
            order_nonce=int.from_bytes(bytes(nonce)[:8], "little", signed=False),
            use_bfv=buy_encrypted.use_bfv,
            trader_id=trader_id,
            nonce=bytes(nonce),
        )

        stub = self._resolve_stub()
        response = stub.SubmitOrder(request, timeout=timeout_seconds)

        return SubmitOrderResult(
            success=not response.is_error,
            match_found=bool(response.result_ciphertext),
            encrypted_result=response.result_ciphertext or None,
            error=response.error_message or None,
            trader_id=trader_id,
            price=int(price),
            quantity=int(quantity),
            side=side,
            nonce=bytes(nonce),
            use_bfv=buy_encrypted.use_bfv,
            is_dummy=is_dummy,
        )
