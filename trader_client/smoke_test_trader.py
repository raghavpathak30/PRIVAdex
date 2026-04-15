from __future__ import annotations

import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from trader_client import TraderClient


def main() -> int:
    client = TraderClient()

    bids = [100.10 + i * 0.01 for i in range(16)]
    asks = [100.00 + i * 0.01 for i in range(16)]
    qtys = [1.0 for _ in range(16)]

    encrypted = client.encrypt_order(bids, asks, qtys)
    size_mb = encrypted.ciphertext_size_bytes / (1024 * 1024)

    print(f"[smoke_test_trader] scheme={'BFV' if encrypted.use_bfv else 'CKKS'}")
    print(f"[smoke_test_trader] ciphertext_bytes={encrypted.ciphertext_size_bytes}")
    print(f"[smoke_test_trader] ciphertext_mb={size_mb:.3f}")

    if encrypted.use_bfv:
        print("[FAIL] expected CKKS path for real-valued input")
        return 1

    if not (3.0 <= size_mb <= 4.5):
        print("[FAIL] ciphertext size not in expected 3-4 MB envelope")
        return 1

    print("[PASS] smoke_test_trader")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
