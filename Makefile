.PHONY: e2e-test e2e-test-fhevm

E2E_ENV := .e2e.env
VENV := .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
RPC_URL ?= http://127.0.0.1:8545
TFHE_PRECOMPILE ?= 0x000000000000000000000000000000000000005d

define CHECK_RPC
curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' $(RPC_URL) >/dev/null || (echo "Hardhat node is not reachable at $(RPC_URL)" && exit 1)
endef

define CHECK_FHEVM
CODE=$$(curl -s -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["$(TFHE_PRECOMPILE)","latest"],"id":1}' $(RPC_URL) | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'); \
if [ -z "$$CODE" ] || [ "$$CODE" = "0x" ] || [ "$$CODE" = "0x0" ]; then \
echo "CRITICAL: Target RPC does not support TFHE precompiles. Use 'fhevm-hardhat' node to run this test."; \
exit 1; \
fi
endef

e2e-test:
	@$(CHECK_RPC)
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) -q install web3 pytest
	@$(PY) scripts/deploy_fhevm_local.py > $(E2E_ENV)
	@set -a; . ./$(E2E_ENV); set +a; $(PY) -m pytest -q tests/test_e2e_settlement.py

e2e-test-fhevm:
	@$(CHECK_RPC)
	@$(CHECK_FHEVM)
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) -q install web3 pytest
	@set -a; . ./$(E2E_ENV) 2>/dev/null || true; set +a; RPC_URL=$(RPC_URL) $(PY) scripts/deploy_fhevm_local.py > $(E2E_ENV)
	@set -a; . ./$(E2E_ENV); set +a; REQUIRE_FHEVM=1 $(PY) -m pytest -q tests/test_e2e_settlement.py
