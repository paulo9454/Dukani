from datetime import datetime, timedelta, timezone

from backend.db.mongo import get_db
from backend.services.inventory import restore_order_stock


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def expire_stale_pending_orders(minutes: int = 30) -> int:
    """
    Release stock reserved by abandoned unpaid online orders.

    Safe/idempotent because restore_order_stock() checks stock_restored.
    """
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    expired = 0

    candidates = list(db.orders.find({
        "payment_status": "pending",
        "status": {"$in": ["pending", "created"]},
        "stock_restored": {"$ne": True},
        "reservation_committed": {"$ne": True},
    }, {"_id": 1, "created_at": 1}))

    for order in candidates:
        created = _parse_dt(order.get("created_at"))
        if not created or created > cutoff:
            continue

        order_id = order["_id"]
        restore_order_stock(order_id)
        db.orders.update_one(
            {
                "_id": order_id,
                "payment_status": "pending",
                "reservation_committed": {"$ne": True},
            },
            {"$set": {
                "status": "cancelled",
                "payment_status": "expired",
                "expired_at": datetime.now(timezone.utc).isoformat(),
                "expiry_reason": "pending_payment_timeout",
            }},
        )
        expired += 1

    return expired
