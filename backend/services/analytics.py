"""Lightweight analytics + abuse guards.

Persists rows in `analytics` for marketing & funnel work, and exposes guards
that fraud-resilient endpoints (orders.create, payments.*) call inline.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta

from backend.db.mongo import get_db


logger = logging.getLogger("dukayko")


# ─────────────────────────────────────────────────────────────────
# ANALYTICS EVENTS
# ─────────────────────────────────────────────────────────────────
EVENT_TYPES = {
    "view_shop", "view_product", "add_to_cart",
    "checkout_start", "order_created", "payment_initiated",
    "payment_success", "payment_failed",
}


def track_event(
    event_type: str,
    *,
    shop_id: str | None = None,
    user_id: str | None = None,
    order_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    if event_type not in EVENT_TYPES:
        # Silently ignore unknown events — we don't want analytics to break
        # business flow.
        return
    try:
        db = get_db()
        db.analytics.insert_one({
            "event_type": event_type,
            "shop_id": shop_id,
            "user_id": user_id,
            "order_id": order_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.warning("analytics insert failed: %s", exc)


# ─────────────────────────────────────────────────────────────────
# DUPLICATE ORDER GUARD
# Prevents the same customer creating an identical order within `window` sec.
# ─────────────────────────────────────────────────────────────────
def is_duplicate_order(
    *,
    shop_id: str,
    items: list,
    customer_key: str,  # phone or email or user_id
    window_seconds: int = 10,
) -> bool:
    if not customer_key:
        return False
    db = get_db()
    fingerprint = hashlib.sha256(
        json.dumps({
            "s": shop_id,
            "c": customer_key.lower(),
            "i": sorted(
                (i.get("product_id"), int(i.get("quantity") or i.get("qty") or 0))
                for i in (items or [])
            ),
        }, sort_keys=True).encode()
    ).hexdigest()

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=window_seconds)).isoformat()
    existing = db.orders.find_one({
        "fingerprint": fingerprint,
        "created_at": {"$gte": cutoff},
    })
    return bool(existing), fingerprint


# ─────────────────────────────────────────────────────────────────
# PAYMENT SPAM GUARD
# Block initiating a new payment for an order that's already paid.
# ─────────────────────────────────────────────────────────────────
def already_paid(order_id: str | None) -> bool:
    if not order_id:
        return False
    db = get_db()
    order = db.orders.find_one({"_id": order_id}, {"payment_status": 1, "status": 1})
    if not order:
        return False
    return order.get("payment_status") == "success" or order.get("status") == "paid"


# ─────────────────────────────────────────────────────────────────
# RECEIPT NUMBER (DK-YYYY-000123)
# Atomic counter keyed by year so receipts are sequential and pretty.
# ─────────────────────────────────────────────────────────────────
def next_receipt_number() -> str:
    db = get_db()
    year = datetime.now(timezone.utc).year
    key = f"receipt:{year}"
    doc = db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,  # type: ignore[arg-type]
    )
    # mongomock may not honor return_document — re-read.
    if not doc or "value" not in doc:
        doc = db.counters.find_one({"_id": key}) or {"value": 1}
    n = int(doc.get("value") or 1)
    return f"DK-{year}-{n:06d}"


# ─────────────────────────────────────────────────────────────────
# ERROR LOG (centralised)
# ─────────────────────────────────────────────────────────────────
def log_error(scope: str, message: str, *, metadata: dict | None = None) -> None:
    try:
        db = get_db()
        db.error_logs.insert_one({
            "scope": scope,
            "message": message,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    logger.error("[%s] %s | meta=%s", scope, message, metadata)
