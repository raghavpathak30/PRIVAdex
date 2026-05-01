#!/usr/bin/env python3
"""Verify dummy cadence by counting dummy SubmitOrder receipts in server logs.

Expected count formula:
  N = duration_seconds / (cadence_ms / 1000)

Usage:
  python3 scripts/verify_cadence.py --duration-seconds 30 --cadence-ms 5000
"""

from __future__ import annotations

import argparse
import os
import pathlib
import queue
import subprocess
import sys
import tempfile
import threading
import time

import grpc

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD_DIR = REPO_ROOT / "build"
SERVER_BINARY = BUILD_DIR / "matching_server"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from trader_client import DummyManager, TraderClient


def _read_lines(stream, out_queue: queue.Queue[str], stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        line = stream.readline()
        if not line:
            return
        out_queue.put(line.rstrip("\n"))


def _wait_for_server_ready(server_address: str, proc: subprocess.Popen[str], timeout_seconds: float = 15.0) -> None:
    channel = grpc.insecure_channel(server_address)
    try:
        grpc.channel_ready_future(channel).result(timeout=timeout_seconds)
    except Exception as exc:
        if proc.poll() is not None:
            raise RuntimeError("matching_server exited before becoming ready") from exc
        raise RuntimeError("timed out waiting for matching_server startup") from exc


def run_verification(server_address: str, cadence_ms: int, duration_seconds: int, trader_id: str) -> None:
    if not SERVER_BINARY.exists():
        raise RuntimeError(f"matching_server binary not found at {SERVER_BINARY}")

    with tempfile.TemporaryDirectory() as tmp:
        env = os.environ.copy()
        env["DARKPOOL_NONCE_DB"] = str(pathlib.Path(tmp) / "nonce_store.sqlite")

        proc = subprocess.Popen(
            [str(SERVER_BINARY), server_address],
            cwd=BUILD_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        try:
            if proc.stdout is None:
                raise RuntimeError("failed to capture matching_server stdout")

            _wait_for_server_ready(server_address, proc)

            log_queue: queue.Queue[str] = queue.Queue()
            stop_reader = threading.Event()
            reader = threading.Thread(
                target=_read_lines,
                args=(proc.stdout, log_queue, stop_reader),
                name="cadence-log-reader",
                daemon=True,
            )
            reader.start()

            client = TraderClient(server_address=server_address)
            manager = DummyManager(client=client, trader_id=trader_id, cadence_ms=cadence_ms)
            manager.start()

            cadence_seconds = cadence_ms / 1000.0
            # Add a small (< cadence) grace period so boundary-tick submissions are
            # counted deterministically without allowing an extra full-cadence tick.
            grace_seconds = min(0.6, cadence_seconds * 0.4)
            time.sleep(duration_seconds + grace_seconds)
            manager.stop()

            # Allow server logs to flush after final heartbeat.
            time.sleep(0.5)
            stop_reader.set()

            lines: list[str] = []
            while True:
                try:
                    lines.append(log_queue.get_nowait())
                except queue.Empty:
                    break

            dummy_receipts = [
                line
                for line in lines
                if "[submit_order_received]" in line and "dummy=1" in line
            ]

            expected = int(duration_seconds / (cadence_ms / 1000.0))
            actual = len(dummy_receipts)

            if actual != expected:
                raise AssertionError(
                    f"Dummy cadence mismatch: expected {expected} receipts, got {actual}."
                )

            print(
                f"[PASS] cadence verified: expected={expected} actual={actual} "
                f"duration={duration_seconds}s cadence={cadence_ms}ms"
            )
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify dummy order cadence against matching_server logs")
    parser.add_argument("--server-address", default="127.0.0.1:50073")
    parser.add_argument("--cadence-ms", type=int, default=5000)
    parser.add_argument("--duration-seconds", type=int, default=30)
    parser.add_argument("--trader-id", default="dummy-cadence")
    args = parser.parse_args()

    if args.cadence_ms <= 0:
        raise SystemExit("cadence-ms must be > 0")
    if args.duration_seconds <= 0:
        raise SystemExit("duration-seconds must be > 0")

    run_verification(
        server_address=args.server_address,
        cadence_ms=args.cadence_ms,
        duration_seconds=args.duration_seconds,
        trader_id=args.trader_id,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
