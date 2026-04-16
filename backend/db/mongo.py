from pymongo import MongoClient
from backend.core.settings import settings
import os

try:
    import mongomock
except Exception:  # pragma: no cover
    mongomock = None


_client = None


def get_client():
    global _client
    if _client is not None:
        return _client

    testing = os.getenv("TESTING", "0") == "1"
    if testing and mongomock:
        _client = mongomock.MongoClient()
    else:
        _client = MongoClient(settings.mongo_url)

    return _client


def get_db():
    db = get_client()[settings.db_name]

    # ✅ DEBUG LINE (CONFIRMS ACTIVE DATABASE)
    print("DB NAME IN USE:", db.name)

    return db


def reset_db():
    db = get_db()

    for col in [
        "users",
        "shops",
        "products",
        "categories",
        "carts",
        "orders",
        "payments",
        "subscriptions",
        "credit_customers",
        "credit_payments_history",
        "damaged_stock",
        "suppliers",
        "refresh_tokens",
        "audit_logs",
        "idempotency_keys",
    ]:
        db[col].delete_many({})
