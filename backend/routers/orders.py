from fastapi import APIRouter, Depends, Query, HTTPException
from backend.db.mongo import get_db
from backend.core.deps import require_roles
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/orders", tags=["orders"])


# =========================
# ⏱ TIME RANGE
# =========================
def today_range():
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


# =========================
# 🔐 STRICT SHOP ACCESS GUARD
# =========================
def assert_shop_access(db, shop_id: str, user):
    shop = db.shops.find_one({
        "_id": shop_id,
    })

    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if user["role"] == "admin":
        return shop

    if shop["owner_id"] == user["_id"]:
        return shop

    raise HTTPException(status_code=403, detail="Unauthorized access")


# =========================
# 📦 GET ORDERS
# =========================
@router.get("/shop/{shop_id}")
def get_shop_orders(
    shop_id: str,
    channel: str | None = Query(default=None),
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    assert_shop_access(db, shop_id, user)

    filters = {
        "shop_id": shop_id,
        "owner_id": user["_id"] if user["role"] != "admin" else {"$exists": True}
    }

    if channel:
        filters["channel"] = channel

    orders = list(db.orders.find(filters).sort("created_at", -1))

    return orders


# =========================
# 📊 TODAY SALES
# =========================
@router.get("/shop/{shop_id}/today")
def get_today_sales(
    shop_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    assert_shop_access(db, shop_id, user)

    start, end = today_range()

    filters = {
        "shop_id": shop_id,
        "created_at": {"$gte": start, "$lt": end}
    }

    if user["role"] != "admin":
        filters["owner_id"] = user["_id"]

    orders = list(db.orders.find(filters))

    return {
        "orders": len(orders),
        "total_sales": sum(o.get("total", 0) for o in orders),
        "total_profit": sum(o.get("profit", 0) for o in orders),
    }


# =========================
# 📊 CHANNEL ANALYTICS
# =========================
@router.get("/shop/{shop_id}/channels")
def sales_by_channel(
    shop_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    assert_shop_access(db, shop_id, user)

    match = {"shop_id": shop_id}

    if user["role"] != "admin":
        match["owner_id"] = user["_id"]

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": "$channel",
                "total_sales": {"$sum": "$total"},
                "total_profit": {"$sum": "$profit"},
                "count": {"$sum": 1},
            }
        }
    ]

    return list(db.orders.aggregate(pipeline))


# =========================
# 📦 TOP PRODUCTS
# =========================
@router.get("/shop/{shop_id}/top-products")
def top_products(
    shop_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    assert_shop_access(db, shop_id, user)

    match = {"shop_id": shop_id}

    if user["role"] != "admin":
        match["owner_id"] = user["_id"]

    pipeline = [
        {"$match": match},
        {"$unwind": "$items"},
        {
            "$group": {
                "_id": "$items.product_id",
                "name": {"$first": "$items.name"},
                "qty_sold": {"$sum": "$items.qty"},
                "revenue": {"$sum": "$items.subtotal"},
            }
        },
        {"$sort": {"qty_sold": -1}},
        {"$limit": 10}
    ]

    return list(db.orders.aggregate(pipeline))


# =========================
# ⚠️ LOW STOCK
# =========================
@router.get("/shop/{shop_id}/low-stock")
def low_stock_alerts(
    shop_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    assert_shop_access(db, shop_id, user)

    filters = {
        "shop_id": shop_id,
        "type": "LOW_STOCK",
        "read": False,
    }

    if user["role"] != "admin":
        filters["owner_id"] = user["_id"]

    alerts = list(db.notifications.find(filters).sort("created_at", -1))

    return alerts


# =========================================================
# 🛒 PUBLIC ORDER CREATION (guest or logged-in customer)
#    Flow: cart → order → payment
#    After this, client calls /api/payments/{provider}/... with the order_id
# =========================================================
from fastapi import Body, Request
from backend.db.mongo import get_db as _get_db
from backend.core.deps import get_current_user_optional
from backend.services.checkout import reserve_stock as _reserve_stock
from backend.services.analytics import (
    track_event as _track,
    is_duplicate_order as _dup_check,
    next_receipt_number as _next_receipt,
    log_error as _log_error,
)
from datetime import datetime as _dt, timezone as _tz
import uuid as _uuid


def _online_ok(shop: dict) -> bool:
    if not shop:
        return False
    plan = shop.get("subscription_plan")
    if plan in {"pos_online", "online", "enterprise"}:
        return True
    return bool(shop.get("is_online_enabled") or shop.get("online_enabled"))


@router.post("/create")
def create_online_order(
    payload: dict = Body(...),
    request: Request = None,
    user=Depends(get_current_user_optional),
):
    """Create an ONLINE order from a cart. Supports guest checkout via
    `customer_info: {name, phone, email}` and logged-in customers via JWT."""
    db = _get_db()

    shop_slug = payload.get("shop_slug")
    shop_id = payload.get("shop_id")
    items_in = payload.get("items") or []
    if not items_in:
        raise HTTPException(status_code=400, detail="items is required")

    shop = None
    if shop_slug:
        shop = db.shops.find_one({"slug": shop_slug})
    elif shop_id:
        shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not _online_ok(shop):
        raise HTTPException(status_code=403, detail="Shop is not selling online")

    # Guest vs logged-in (customer auth is no longer required)
    customer_info = payload.get("customer_info") or {}
    # Accept flat spec-style fields too: phone_number, name
    if payload.get("phone_number") and not customer_info.get("phone"):
        customer_info["phone"] = payload.get("phone_number")
    if payload.get("name") and not customer_info.get("name"):
        customer_info["name"] = payload.get("name")

    if user and user.get("role") == "customer":
        customer_id = user["_id"]
        customer_info = {
            "name": customer_info.get("name") or user.get("full_name") or "Customer",
            "phone": customer_info.get("phone") or user.get("phone"),
            "email": customer_info.get("email") or user.get("email"),
        }
    else:
        customer_id = None
        if not customer_info.get("phone"):
            raise HTTPException(
                status_code=400,
                detail="Phone number is required to place an order",
            )
        customer_info.setdefault("name", "Customer")

    # 🛡 Duplicate-order guard (10s window)
    customer_key = (
        customer_info.get("phone") or customer_info.get("email") or customer_id or ""
    )
    is_dup, fingerprint = _dup_check(
        shop_id=shop["_id"], items=items_in, customer_key=str(customer_key)
    )
    if is_dup:
        raise HTTPException(
            status_code=429,
            detail="Duplicate order detected — please wait a few seconds.",
        )

    # Validate stock + compute total
    total = 0.0
    order_items = []
    for it in items_in:
        pid = it.get("product_id")
        qty = int(it.get("quantity") or it.get("qty") or 0)
        if not pid or qty <= 0:
            raise HTTPException(status_code=400, detail="Invalid item")
        # 🛒 Resolve qty + variant/unit choice atomically; raises 400 on insufficient stock.
        res = _reserve_stock(db, pid, shop["_id"], {
            "qty": qty,
            "unit_label": it.get("unit_label"),
            "variant_name": it.get("variant_name"),
        })
        product = res["product"]
        price = float(res["unit_price"])
        subtotal = round(price * qty, 2)
        total += subtotal
        line = {
            "product_id": product["_id"],
            "name": product.get("name"),
            "image": product.get("image"),
            "quantity": qty,
            "price": price,
            "subtotal": subtotal,
        }
        if res.get("unit_label"):
            line["unit_label"] = res["unit_label"]
            line["unit_quantity"] = res["unit_quantity"]
        if res.get("variant_name"):
            line["variant_name"] = res["variant_name"]
        order_items.append(line)

    order_id = str(_uuid.uuid4())
    now = _dt.now(_tz.utc).isoformat()
    receipt_number = _next_receipt()
    order = {
        "_id": order_id,
        "receipt_number": receipt_number,
        "fingerprint": fingerprint,
        "shop_id": shop["_id"],
        "shop_slug": shop.get("slug"),
        "customer_id": customer_id,
        "customer_info": customer_info,
        "items": order_items,
        "total": round(total, 2),
        "total_amount": round(total, 2),  # alias for spec
        "status": "pending",              # pending | paid | processing | completed | cancelled
        "payment_status": "pending",      # pending | success | failed
        "payment_method": None,
        "payment_provider": None,
        "order_source": "online",
        "stock_restored": False,
        "reservation_committed": False,
        "created_at": now,
    }
    db.orders.insert_one(order)

    # 🔔 OWNER NOTIFICATION (lightweight pull; the Owner Orders dashboard polls)
    try:
        db.notifications.insert_one({
            "_id": str(_uuid.uuid4()),
            "owner_id": shop.get("owner_id"),
            "shop_id": shop["_id"],
            "type": "NEW_ORDER",
            "message": f"New online order — KES {round(total, 2)}",
            "order_id": order_id,
            "read": False,
            "created_at": now,
        })
    except Exception:
        pass

    # 📧 BEST-EFFORT EMAIL CONFIRMATION
    try:
        from backend.services.email_service import send_order_confirmation, is_email_enabled
        if is_email_enabled() and customer_info.get("email"):
            send_order_confirmation(customer_info["email"], order)
    except Exception as exc:
        _log_error("orders.email_confirmation", str(exc), metadata={"order_id": order_id})

    # 📊 ANALYTICS
    _track(
        "order_created",
        shop_id=shop["_id"],
        user_id=customer_id,
        order_id=order_id,
        metadata={"total": order["total"], "items": len(order_items)},
    )

    return {
        "order_id": order_id,
        "receipt_number": receipt_number,
        "status": order["status"],
        "total": order["total"],
        "currency": "KES",
        "items": order_items,
        "shop": {"_id": shop["_id"], "name": shop.get("name"), "slug": shop.get("slug")},
    }


# =========================================================
# 📋 OWNER — LIST ALL ORDERS (own shops only, online+pos)
# =========================================================
@router.get("")
def list_owner_orders(
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = _get_db()
    if user["role"] == "admin":
        shop_ids = [s["_id"] for s in db.shops.find({}, {"_id": 1})]
    else:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]

    q = {"shop_id": {"$in": shop_ids}}
    if status:
        q["status"] = status
    if source:
        q["order_source"] = source

    orders = list(db.orders.find(q).sort("created_at", -1).limit(200))
    # include minimal shop context
    shops = {s["_id"]: s for s in db.shops.find({"_id": {"$in": shop_ids}}, {"_id": 1, "name": 1, "slug": 1})}
    for o in orders:
        s = shops.get(o.get("shop_id")) or {}
        o["shop_name"] = s.get("name")
        o["shop_slug"] = s.get("slug")
    return orders


# =========================================================
# 📄 SINGLE ORDER (owner or the customer who placed it)
# =========================================================
# =========================================================
# 📊 OWNER STATS (today's revenue, pending count, paid count)
# =========================================================
@router.get("/stats")
def order_stats(user=Depends(require_roles("owner", "admin", "partner"))):
    db = _get_db()
    if user["role"] == "admin":
        shop_ids = [s["_id"] for s in db.shops.find({}, {"_id": 1})]
    else:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]

    start = _dt.now(_tz.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    base = {"shop_id": {"$in": shop_ids}}
    today = {**base, "created_at": {"$gte": start}}

    today_orders = list(db.orders.find(today, {"total": 1, "status": 1}))
    pending = db.orders.count_documents({**base, "status": "pending"})
    paid = db.orders.count_documents({**base, "status": "paid"})
    processing = db.orders.count_documents({**base, "status": "processing"})
    completed = db.orders.count_documents({**base, "status": "completed"})
    cancelled = db.orders.count_documents({**base, "status": "cancelled"})

    today_revenue = sum(float(o.get("total", 0)) for o in today_orders if o.get("status") in {"paid", "processing", "completed"})
    return {
        "today_orders": len(today_orders),
        "today_revenue": round(today_revenue, 2),
        "pending": pending,
        "paid": paid,
        "processing": processing,
        "completed": completed,
        "cancelled": cancelled,
    }


# =========================================================
# 👤 CUSTOMER — MY ORDERS
# =========================================================
@router.get("/me")
def my_orders(user=Depends(require_roles("customer", "owner", "shopkeeper", "admin", "partner"))):
    db = _get_db()
    return list(db.orders.find({"customer_id": user["_id"]}).sort("created_at", -1).limit(100))


# =========================================================
# 🔎 PUBLIC ORDER TRACKING (by id + contact match)
# =========================================================
@router.post("/{order_id}/mark-paid-manual")
def mark_paid_manual(order_id: str, payload: dict = Body(default={})):
    """Customer-triggered "I have paid manually" acknowledgement.

    Moves the order to `payment_status=pending_confirmation` so the owner
    knows to check their M-Pesa for the matching transaction. Requires a
    phone-number match so a random visitor can't flip someone else's order.
    """
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    phone = str(payload.get("phone") or "").strip().replace(" ", "").replace("-", "")
    info = order.get("customer_info") or {}
    stored = (info.get("phone") or order.get("phone_number") or "").strip()
    if stored and phone and stored != phone:
        raise HTTPException(status_code=403, detail="Phone does not match this order")
    if order.get("payment_status") == "success":
        return {"ok": True, "already_paid": True}
    db.orders.update_one(
        {"_id": order_id},
        {"$set": {
            "payment_method": "mpesa_manual",
            "payment_provider": "mpesa_manual",
            "payment_status": "pending_confirmation",
            "mpesa_manual_claimed_at": _dt.now(_tz.utc).isoformat(),
        }},
    )
    return {"ok": True, "payment_status": "pending_confirmation"}


@router.get("/track/{order_id}")
def track_order(order_id: str, contact: str | None = Query(default=None)):
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    info = order.get("customer_info") or {}
    if contact and contact.strip().lower() not in {
        (info.get("email") or "").lower(),
        (info.get("phone") or "").strip(),
    }:
        raise HTTPException(status_code=403, detail="Contact does not match this order")
    return {
        "_id": order["_id"],
        "status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "payment_method": order.get("payment_method"),
        "total": order.get("total"),
        "items": order.get("items"),
        "shop_id": order.get("shop_id"),
        "shop_slug": order.get("shop_slug"),
        "created_at": order.get("created_at"),
    }


# =========================================================
# 🔎 PUBLIC ORDER LOOKUP (by phone, optionally scoped to shop)
# Used by /shop/{slug} "Already ordered?" tile so returning
# customers can find their latest order without the link.
# =========================================================
@router.get("/lookup")
def lookup_by_phone(
    phone: str = Query(..., min_length=6),
    slug: str | None = Query(default=None),
):
    db = _get_db()
    norm = phone.strip().replace(" ", "").replace("-", "")
    query: dict = {
        "$or": [
            {"customer_info.phone": norm},
            {"phone_number": norm},
        ]
    }
    if slug:
        shop = db.shops.find_one({"slug": slug}, {"_id": 1})
        if shop:
            query["shop_id"] = shop["_id"]
    order = (
        db.orders.find(query, {"_id": 1, "created_at": 1})
        .sort("created_at", -1)
        .limit(1)
    )
    order_list = list(order)
    if not order_list:
        raise HTTPException(status_code=404, detail="No orders found for this phone number")
    return {"order_id": order_list[0]["_id"], "created_at": order_list[0].get("created_at")}


@router.get("/{order_id}")
def get_order(order_id: str, user=Depends(get_current_user_optional)):
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Public read-only view if no auth — return a trimmed payload so the
    # confirmation page works for guest checkout.
    if not user:
        return {
            "_id": order["_id"],
            "status": order.get("status"),
            "payment_status": order.get("payment_status"),
            "total": order.get("total"),
            "items": order.get("items"),
            "shop_id": order.get("shop_id"),
            "shop_slug": order.get("shop_slug"),
            "created_at": order.get("created_at"),
        }

    role = user.get("role")
    if role in {"owner", "partner", "admin"}:
        if role != "admin":
            shop = db.shops.find_one({"_id": order.get("shop_id")})
            if not shop or shop.get("owner_id") != user["_id"]:
                raise HTTPException(status_code=403, detail="Not allowed")
        return order

    if role == "customer" and order.get("customer_id") == user["_id"]:
        return order

    # fallback: trimmed view
    return {
        "_id": order["_id"],
        "status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "total": order.get("total"),
        "items": order.get("items"),
    }


# =========================================================
# 🔄 OWNER — UPDATE ORDER STATUS (processing → completed, or cancel)
# =========================================================
@router.post("/{order_id}/status")
def update_order_status(
    order_id: str,
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if user["role"] != "admin":
        shop = db.shops.find_one({"_id": order.get("shop_id")})
        if not shop or shop.get("owner_id") != user["_id"]:
            raise HTTPException(status_code=403, detail="Not allowed")

    new_status = payload.get("status")
    allowed = {"processing", "completed", "cancelled"}
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")

    # Simple state machine
    current = order.get("status")
    if current == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled orders cannot transition")
    if new_status == "completed" and current not in {"paid", "processing"}:
        raise HTTPException(status_code=400, detail="Order must be paid or processing before completion")

    db.orders.update_one(
        {"_id": order_id},
        {"$set": {"status": new_status, "status_updated_at": _dt.now(_tz.utc).isoformat()}},
    )
    return {"ok": True, "status": new_status}


# =========================================================
# ✅ OWNER — CONFIRM MANUAL M-PESA PAYMENT
# Closes the loop on `mark-paid-manual` claims by letting the
# shop owner verify they actually received the funds.
# =========================================================
@router.post("/{order_id}/confirm-payment")
def confirm_payment(
    order_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if user["role"] != "admin":
        shop = db.shops.find_one({"_id": order.get("shop_id")})
        if not shop or shop.get("owner_id") != user["_id"]:
            raise HTTPException(status_code=403, detail="Not allowed")

    if order.get("payment_status") != "pending_confirmation":
        raise HTTPException(
            status_code=400,
            detail="Only orders awaiting manual confirmation can be confirmed",
        )

    now = _dt.now(_tz.utc).isoformat()
    db.orders.update_one(
        {"_id": order_id},
        {"$set": {
            "payment_status": "success",
            "status": "paid",
            "paid_at": now,
            "manually_confirmed_by": user["_id"],
            "manually_confirmed_at": now,
        }},
    )
    return {"ok": True, "payment_status": "success", "status": "paid", "paid_at": now}


# =========================================================
# ❌ OWNER — REJECT MANUAL M-PESA PAYMENT
# =========================================================
@router.post("/{order_id}/reject-payment")
def reject_payment(
    order_id: str,
    payload: dict = Body(default={}),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = _get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if user["role"] != "admin":
        shop = db.shops.find_one({"_id": order.get("shop_id")})
        if not shop or shop.get("owner_id") != user["_id"]:
            raise HTTPException(status_code=403, detail="Not allowed")

    if order.get("payment_status") != "pending_confirmation":
        raise HTTPException(
            status_code=400,
            detail="Only orders awaiting manual confirmation can be rejected",
        )

    now = _dt.now(_tz.utc).isoformat()
    reason = (payload.get("reason") or "").strip() or None
    db.orders.update_one(
        {"_id": order_id},
        {"$set": {
            "payment_status": "failed",
            "manually_rejected_by": user["_id"],
            "manually_rejected_at": now,
            "manual_rejection_reason": reason,
        }},
    )
    return {"ok": True, "payment_status": "failed"}
