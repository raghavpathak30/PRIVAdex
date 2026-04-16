from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Callable


class OrderNonceStore:
    def __init__(
        self,
        db_path: str | Path | None = None,
        expiry_seconds: int = 300,
        now_fn: Callable[[], int] | None = None,
    ) -> None:
        if db_path is None:
            db_path = Path(__file__).resolve().parent / "nonce_store.sqlite"
        self._db_path = str(db_path)
        self._expiry_seconds = int(expiry_seconds)
        self._now_fn = now_fn or (lambda: int(time.time()))
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS nonces (
                nonce BLOB PRIMARY KEY,
                trader_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )
            """
        )
        self._conn.commit()

    def insert_nonce(self, nonce_bytes: bytes, trader_id: str, timestamp: int | None = None) -> bool:
        if not isinstance(nonce_bytes, (bytes, bytearray, memoryview)):
            raise TypeError("nonce_bytes must be bytes-like")
        nonce = bytes(nonce_bytes)
        if len(nonce) != 16:
            raise ValueError("nonce_bytes must be exactly 16 bytes")
        if not isinstance(trader_id, str) or not trader_id:
            raise ValueError("trader_id must be a non-empty string")

        current_time = int(self._now_fn())
        nonce_timestamp = current_time if timestamp is None else int(timestamp)
        if current_time - nonce_timestamp > self._expiry_seconds:
            return False

        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO nonces (nonce, trader_id, timestamp) VALUES (?, ?, ?)",
                    (nonce, trader_id, nonce_timestamp),
                )
                self._conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False
