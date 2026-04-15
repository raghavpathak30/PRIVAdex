from .order_nonce_store import OrderNonceStore

__all__ = ["OrderNonceStore", "SubmitOrderResult", "TraderClient"]


def __getattr__(name):
	if name in {"SubmitOrderResult", "TraderClient"}:
		from .trader_client import SubmitOrderResult, TraderClient

		globals()["SubmitOrderResult"] = SubmitOrderResult
		globals()["TraderClient"] = TraderClient
		return globals()[name]
	raise AttributeError(name)
