from __future__ import annotations

import sys
from pathlib import Path

from grpc_tools import protoc


REPO_ROOT = Path(__file__).resolve().parents[1]
PROTO_FILE = REPO_ROOT / "proto" / "darkpool.proto"
GENERATED_DIR = Path(__file__).resolve().parent / "_generated"
PB2_FILE = GENERATED_DIR / "darkpool_pb2.py"
GRPC_FILE = GENERATED_DIR / "darkpool_pb2_grpc.py"


def _ensure_generated() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    needs_regen = (
        not PB2_FILE.exists()
        or not GRPC_FILE.exists()
        or PB2_FILE.stat().st_mtime < PROTO_FILE.stat().st_mtime
        or GRPC_FILE.stat().st_mtime < PROTO_FILE.stat().st_mtime
    )
    if needs_regen:
        result = protoc.main(
            [
                "grpc_tools.protoc",
                f"--proto_path={PROTO_FILE.parent}",
                f"--python_out={GENERATED_DIR}",
                f"--grpc_python_out={GENERATED_DIR}",
                str(PROTO_FILE),
            ]
        )
        if result != 0:
            raise RuntimeError("failed to generate Python gRPC bindings for darkpool.proto")

    generated_dir_str = str(GENERATED_DIR)
    if generated_dir_str not in sys.path:
        sys.path.insert(0, generated_dir_str)


_ensure_generated()

import darkpool_pb2  # type: ignore  # noqa: E402
import darkpool_pb2_grpc  # type: ignore  # noqa: E402
