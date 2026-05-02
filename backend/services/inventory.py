"""Inventory reservation/release service.

Stock is decremented atomically at reservation time (order creation) — that
prevents overselling under concurrency. We also track `reserved` for visibility.
On payment failure we RESTORE stock; on success we just clear the reservation.
"""
from __future__ import annotations

from backend.db.mongo import get_db


def restore_order_stock(order_id: str) -> bool:
    """Idempotently restore stock for a cancelled/failed order."""
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        return False
    if order.get("stock_restored"):
        return True
    for item in order.get("items", []) or []:
        qty = int(item.get("quantity") or item.get("qty") or 0)
        if qty <= 0:
            continue
        db.products.update_one(
            {"_id": item.get("product_id"), "shop_id": order.get("shop_id")},
            {"$inc": {"stock": qty, "reserved": -qty}},
        )
    db.orders.update_one({"_id": order_id}, {"$set": {"stock_restored": True}})
    return True


def commit_order_reservation(order_id: str) -> bool:
    """On payment success: stock is already decremented; just decrement reserved counter."""
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order or order.get("reservation_committed"):
        return False
    for item in order.get("items", []) or []:
        qty = int(item.get("quantity") or item.get("qty") or 0)
        if qty <= 0:
            continue
        db.products.update_one(
            {"_id": item.get("product_id"), "shop_id": order.get("shop_id")},
            {"$inc": {"reserved": -qty}},
        )
    db.orders.update_one({"_id": order_id}, {"$set": {"reservation_committed": True}})
    return True
