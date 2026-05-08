"""Inventory reservation/release service.

Stock is decremented atomically at reservation time (order creation) — that
prevents overselling under concurrency. We also track `reserved` for visibility.
On payment failure we RESTORE stock; on success we just clear the reservation.
"""
from __future__ import annotations

from backend.db.mongo import get_db


def restore_order_stock(order_id: str) -> bool:
    """Idempotently restore stock for a cancelled/failed order.

    Handles all three product types — standard (`stock`), unit-based
    (`base_stock_quantity` + reserved_base) and variant (per-variant
    stock). Order line items carry the metadata needed to know which
    bucket to restore.
    """
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        return False
    if order.get("stock_restored"):
        return True
    shop_id = order.get("shop_id")
    for item in order.get("items", []) or []:
        qty = int(item.get("quantity") or item.get("qty") or 0)
        if qty <= 0:
            continue
        product_id = item.get("product_id")

        # ── unit-based ──
        if item.get("unit_label") and item.get("unit_quantity"):
            amount = float(item["unit_quantity"]) * qty
            db.products.update_one(
                {"_id": product_id, "shop_id": shop_id},
                {"$inc": {
                    "base_stock_quantity": amount,
                    "reserved_base": -amount,
                }},
            )
            continue

        # ── variant ──
        if item.get("variant_name"):
            db.products.update_one(
                {
                    "_id": product_id,
                    "shop_id": shop_id,
                    "variants.name": item["variant_name"],
                },
                {"$inc": {
                    "variants.$.stock": qty,
                    "variants.$.reserved": -qty,
                }},
            )
            continue

        # ── standard (legacy / current default) ──
        db.products.update_one(
            {"_id": product_id, "shop_id": shop_id},
            {"$inc": {"stock": qty, "reserved": -qty}},
        )
    db.orders.update_one({"_id": order_id}, {"$set": {"stock_restored": True}})
    return True


def commit_order_reservation(order_id: str) -> bool:
    """On payment success: stock is already decremented; just clear the reserved counter."""
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order or order.get("reservation_committed"):
        return False
    shop_id = order.get("shop_id")
    for item in order.get("items", []) or []:
        qty = int(item.get("quantity") or item.get("qty") or 0)
        if qty <= 0:
            continue
        product_id = item.get("product_id")

        if item.get("unit_label") and item.get("unit_quantity"):
            amount = float(item["unit_quantity"]) * qty
            db.products.update_one(
                {"_id": product_id, "shop_id": shop_id},
                {"$inc": {"reserved_base": -amount}},
            )
            continue

        if item.get("variant_name"):
            db.products.update_one(
                {"_id": product_id, "shop_id": shop_id, "variants.name": item["variant_name"]},
                {"$inc": {"variants.$.reserved": -qty}},
            )
            continue

        db.products.update_one(
            {"_id": product_id, "shop_id": shop_id},
            {"$inc": {"reserved": -qty}},
        )
    db.orders.update_one({"_id": order_id}, {"$set": {"reservation_committed": True}})
    return True
