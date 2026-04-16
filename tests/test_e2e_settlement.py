import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "artifacts/contracts/PrivaDEXDarkPool.fhEVM.sol/PrivaDEXDarkPoolFHEVM.json"
BRIDGE = ROOT / "scripts/bridge_settler.py"
MOCK_JSON = ROOT / "test/mock_match.json"
MOCK_LOG = ROOT / "test/mock_server.log"


def _require_env(name: str) -> str:
    value = os.getenv(name)
    assert value, f"Missing required env var: {name}"
    return value


def _load_contract(w3: Web3, address: str):
    artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=artifact["abi"])


def _seed_orders(w3: Web3, contract) -> None:
    # On plain Hardhat nodes without fhevm runtime support, submitOrder may revert due
    # encrypted-input proof checks. For deterministic e2e wiring, patch orders.length=2.
    if contract.functions.totalOrders().call() >= 2:
        return

    slot_orders_length = "0x" + "00" * 31 + "01"
    value_two = "0x" + "00" * 31 + "02"
    patched = w3.provider.make_request(
        "hardhat_setStorageAt",
        [contract.address, slot_orders_length, value_two],
    )
    assert "error" not in patched, f"Failed to patch orders length via hardhat_setStorageAt: {patched}"
    w3.provider.make_request("evm_mine", [])
    assert contract.functions.totalOrders().call() >= 2, "orders.length patch did not take effect"


def _run_bridge(args, env):
    cmd = [sys.executable, str(BRIDGE)] + args
    return subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)


def _extract_bridge_result(stdout: str) -> dict:
    for line in stdout.splitlines():
        if line.startswith("BRIDGE_RESULT="):
            return json.loads(line.split("=", 1)[1])
    raise AssertionError(f"Bridge result JSON not found in output:\n{stdout}")


def test_e2e_settlement_and_replay_guard():
    rpc_url = _require_env("RPC_URL")
    contract_address = _require_env("PRIVADEX_FHEVM_CONTRACT")
    settler_pk = _require_env("SETTLER_PRIVATE_KEY")

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    assert w3.is_connected(), f"Cannot connect to RPC: {rpc_url}"

    contract = _load_contract(w3, contract_address)
    _seed_orders(w3, contract)

    request_id = "0x" + "11" * 32

    env = os.environ.copy()
    env["RPC_URL"] = rpc_url
    env["PRIVADEX_FHEVM_CONTRACT"] = contract_address
    env["SETTLER_PRIVATE_KEY"] = settler_pk

    strict_fhevm = os.getenv("REQUIRE_FHEVM", "0") == "1"

    first = _run_bridge(["--json", str(MOCK_JSON), "--request-id", request_id], env)
    first_combined = f"{first.stdout}\n{first.stderr}".lower()
    if first.returncode != 0 and "unexpected amount of data" in first_combined:
        if strict_fhevm:
            pytest.fail(
                "CRITICAL: Target RPC does not support TFHE precompiles. "
                "Use 'fhevm-hardhat' node to run this test."
            )
        pytest.skip(
            "fhEVM runtime precompiles are unavailable on this local node; "
            "matchOrders cannot execute without fhevm-enabled runtime"
        )

    assert first.returncode == 0, (
        "First bridge settlement failed unexpectedly.\n"
        f"stdout:\n{first.stdout}\n"
        f"stderr:\n{first.stderr}"
    )

    result = _extract_bridge_result(first.stdout)
    assert result["request_id"] == request_id[2:], "Bridge returned unexpected request_id"

    settled = contract.functions.settledRequestIds(bytes.fromhex(result["request_id"])).call()
    assert settled is True, "Request ID was not marked settled on-chain after successful bridge tx"

    second = _run_bridge(["--log", str(MOCK_LOG), "--request-id", request_id], env)
    assert second.returncode != 0, "Replay settlement should fail with duplicate request_id"

    combined = f"{second.stdout}\n{second.stderr}".lower()
    assert (
        "duplicate request_id" in combined or "contract revert" in combined
    ), f"Expected duplicate/revert reason in replay failure output. Got:\n{second.stdout}\n{second.stderr}"
