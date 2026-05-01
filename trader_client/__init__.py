from .order_nonce_store import OrderNonceStore

__all__ = ["DummyManager", "OrderNonceStore", "SubmitOrderResult", "TraderClient"]


def __getattr__(name):
	if name in {"DummyManager", "SubmitOrderResult", "TraderClient"}:
		from .trader_client import DummyManager, SubmitOrderResult, TraderClient

		globals()["DummyManager"] = DummyManager
		globals()["SubmitOrderResult"] = SubmitOrderResult
		globals()["TraderClient"] = TraderClient
		return globals()[name]
	raise AttributeError(name)
