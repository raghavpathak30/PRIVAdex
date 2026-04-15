from __future__ import annotations

import importlib
import pathlib
import subprocess
import sys


def load_seal_wrapper():
    try:
        return importlib.import_module("seal_wrapper_dp")
    except Exception:
        backend_dir = pathlib.Path(__file__).resolve().parent
        cmd = [sys.executable, "setup_seal_wrapper.py", "build_ext", "--inplace"]
        subprocess.check_call(cmd, cwd=backend_dir)
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        return importlib.import_module("seal_wrapper_dp")
