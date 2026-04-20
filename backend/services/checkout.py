from fastapi import HTTPException
from backend.db.mongo import get_db
from backend.services.payment_verifier import verify_payment
from backend.services.receipt import build_receipt
from backend.services.audit import audit_log
from datetime import datetime, timezone
import uuid


# =========================
# UTILS
# =========================
def now():
    return datetime.now(timezone.utc).isoformat()


def round2(v: float) -> float:
    return round(float(v), 2)


# =========================
# SHOP RULE
# =========================
def shop_online_enabled(shop_id: str) -> bool:
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        return False

    if shop.get("online_enabled") is True:
        return True

    sub = db.subscriptions.find_one({"shop_id": shop_id})
    return sub and sub.get("status") == "active"


# =========================
# IDEMPOTENCY
# =========================
def ensure_idempotency(scope: dict, key: str):
    db = get_db()
    record = db.idempotency_keys.find_one({"scope": scope, "key": key})
    if not record:
        return None
    return db.orders.find_one({"_id": record["order_id"]})


def remember_idempotency(scope: dict, key: str, order_id: str):
    db = get_db()
    db.idempotency_keys.update_one(
        {"scope": scope, "key": key},
        {"$set": {"scope": scope, "key": key, "order_id": order_id}},
        upsert=True,
    )


# =========================
# STOCK RESERVATION
# =========================
def reserve_stock(db, product_id: str, shop_id: str, qty: int):
    product = db.products.find_one({"_id": product_id, "shop_id": shop_id})
    if not product:
        raise HTTPException(404, "Product not found")

    updated = db.products.update_one(
        {
            "_id": product_id,
            "shop_id": shop_id,
            "stock": {"$gte": qty},
        },
        {"$inc": {"stock": -qty}},
    )

    if updated.modified_count == 0:
        raise HTTPException(400, f"Insufficient stock for {product.get('name')}")

    return product


# =========================
# CUSTOMER CHECKOUT
# =========================
def checkout_customer(
    user: dict,
    payment_provider: str,
    idempotency_key: str,
    payment_method: str = "card",
    payment_meta: dict | None = None,
):
    db = get_db()
    scope = {"customer_id": user["_id"], "flow": "customer_checkout"}

    if existing := ensure_idempotency(scope, idempotency_key):
        return existing

    cart = db.carts.find_one({"customer_id": user["_id"]})
    if not cart or not cart.get("items"):
        raise HTTPException(400, "Cart is empty")

    shop_id = cart["items"][0]["shop_id"]

    if not shop_online_enabled(shop_id):
        raise HTTPException(403, "Shop blocked")

    total = 0
    items = []

    for i in cart["items"]:
        product = reserve_stock(db, i["product_id"], shop_id, i["qty"])

        price = product.get("price", 0)
        subtotal = price * i["qty"]
        total += subtotal

        items.append({
            "product_id": product["_id"],
            "name": product.get("name"),
            "qty": i["qty"],
            "price": price,
            "subtotal": subtotal,
        })

    # =========================
    # CREDIT SUPPORT
    # =========================
    if payment_method == "credit":
        payment_status = "pending"
        status = "credit"

        db.debts.insert_one({
            "_id": str(uuid.uuid4()),
            "customer_id": user["_id"],
            "shop_id": shop_id,
            "amount": round2(total),
            "status": "unpaid",
            "created_at": now(),
        })

    else:
        verification = verify_payment(payment_method, total, payment_meta)
        payment_status = verification["status"]
        status = "paid" if payment_status == "confirmed" else "created"

    order_id = str(uuid.uuid4())

    order = {
        "_id": order_id,
        "customer_id": user["_id"],
        "shop_id": shop_id,
        "items": items,
        "total": round2(total),
        "status": status,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "created_at": now(),
    }

    db.orders.insert_one(order)

    remember_idempotency(scope, idempotency_key, order_id)

    # ✅ RECEIPT
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(404, "Shop not found for receipt")
    receipt = build_receipt(order, shop, operator=None)

    return {**order, "receipt": receipt}


# =========================
# POS CHECKOUT (FULL SYSTEM)
# =========================
def checkout_pos(
    operator: dict,
    shop_id: str,
    items: list,
    payment_provider: str,
    idempotency_key: str,
    payment_method: str = "cash",
    discount: float = 0.0,
    tax_percent: float = 0.0,
    payment_meta: dict | None = None,
    order_source: str = "physical",
):
    db = get_db()

    scope = {
        "shop_id": shop_id,
        "operator_id": operator["_id"],
        "flow": "pos_checkout",
    }

    if existing := ensure_idempotency(scope, idempotency_key):
        return existing

    total_base = 0
    order_items = []

    for i in items:
        product = reserve_stock(db, i["product_id"], shop_id, i["qty"])

        price = product.get("price", 0)
        subtotal = price * i["qty"]
        total_base += subtotal

        order_items.append({
            "product_id": product["_id"],
            "name": product.get("name"),
            "qty": i["qty"],
            "price": price,
            "subtotal": subtotal,
        })

    tax = (tax_percent / 100) * total_base
    total = max(total_base + tax - discount, 0)

    # =========================
    # CREDIT (KEY FEATURE)
    # =========================
    if payment_method == "credit":
        if order_source != "physical":
            raise HTTPException(400, "Credit only allowed for physical shop")
        payment_status = "pending"
        status = "credit"

        db.debts.insert_one({
            "_id": str(uuid.uuid4()),
            "shop_id": shop_id,
            "amount": round2(total),
            "status": "unpaid",
            "created_at": now(),
        })

    else:
        verification = verify_payment(payment_method, total, payment_meta)
        payment_status = verification["status"]
        status = "paid" if payment_status == "confirmed" else "created"

    order_id = str(uuid.uuid4())

    order = {
        "_id": order_id,
        "shop_id": shop_id,
        "items": order_items,
        "subtotal": round2(total_base),
        "tax": round2(tax),
        "discount": round2(discount),
        "total": round2(total),
        "status": status,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "created_by": operator["_id"],
        "created_at": now(),
    }

    db.orders.insert_one(order)

    remember_idempotency(scope, idempotency_key, order_id)

    # ✅ RECEIPT SYSTEM
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(404, "Shop not found for receipt")
    receipt = build_receipt(order, shop, operator)

    audit_log(
        "pos_checkout",
        actor_id=operator["_id"],
        metadata={"order_id": order_id},
    )

    return {**order, "receipt": receipt}
