from fastapi import HTTPException
from backend.db.mongo import get_db
from datetime import datetime, timezone
from backend.services.payment_verifier import verify_payment
from backend.services.audit import audit_log
import uuid


ONLINE_ALLOWED = {"online", "legacy", 1000}


def shop_online_enabled(shop_id: str) -> bool:
    db = get_db()
    subscription = db.subscriptions.find_one({"shop_id": shop_id})
    if not subscription:
        return True
    plan = subscription.get("plan", "legacy")
    return plan in ONLINE_ALLOWED


def ensure_idempotency(scope: dict, idempotency_key: str):
    db = get_db()
    key = db.idempotency_keys.find_one({"scope": scope, "key": idempotency_key})
    if not key:
        return None
    return db.orders.find_one({"_id": key["order_id"]})


def remember_idempotency(scope: dict, idempotency_key: str, order_id: str):
    db = get_db()
    db.idempotency_keys.update_one(
        {"scope": scope, "key": idempotency_key},
        {"$set": {"scope": scope, "key": idempotency_key, "order_id": order_id}},
        upsert=True,
    )


def _update_credit_ledger(customer_id: str, shop_id: str, amount: float, order_id: str):
    db = get_db()
    existing = db.credit_customers.find_one({"customer_id": customer_id, "shop_id": shop_id})
    if existing:
        balance = existing.get("balance", 0.0) + amount
        db.credit_customers.update_one({"_id": existing["_id"]}, {"$set": {"balance": round(balance, 2)}})
        ledger_id = existing["_id"]
    else:
        ledger_id = str(uuid.uuid4())
        db.credit_customers.insert_one(
            {
                "_id": ledger_id,
                "customer_id": customer_id,
                "shop_id": shop_id,
                "balance": round(amount, 2),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    db.credit_payments_history.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "ledger_id": ledger_id,
            "customer_id": customer_id,
            "shop_id": shop_id,
            "order_id": order_id,
            "amount": round(amount, 2),
            "type": "debit",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    audit_log("credit_ledger_update", actor_id=customer_id, metadata={"shop_id": shop_id, "amount": amount})


def checkout_customer(user: dict, payment_provider: str, idempotency_key: str, payment_method: str = "card", payment_meta: dict | None = None):
    db = get_db()
    scope = {"customer_id": user["_id"], "flow": "customer_checkout"}
    if (existing := ensure_idempotency(scope, idempotency_key)):
        return existing

    cart = db.carts.find_one({"customer_id": user["_id"]})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")

    shop_ids = set(i["shop_id"] for i in cart["items"])
    if len(shop_ids) != 1:
        raise HTTPException(status_code=400, detail="Cart must contain one shop only")

    shop_id = next(iter(shop_ids))
    if not shop_online_enabled(shop_id):
        raise HTTPException(status_code=403, detail="Shop subscription blocks online checkout")

    total = 0.0
    order_items = []
    for item in cart["items"]:
        product = db.products.find_one({"_id": item["product_id"]})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item['product_id']} not found")
        if product["stock"] < item["qty"]:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product['name']}")

    for item in cart["items"]:
        product = db.products.find_one({"_id": item["product_id"]})
        updated = db.products.update_one(
            {"_id": product["_id"], "stock": {"$gte": item["qty"]}},
            {"$inc": {"stock": -item["qty"]}},
        )
        if updated.modified_count == 0:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product['name']}")

        subtotal = product["price"] * item["qty"]
        total += subtotal
        order_items.append(
            {
                "product_id": product["_id"],
                "name": product["name"],
                "qty": item["qty"],
                "price": product["price"],
                "subtotal": subtotal,
            }
        )

    verification = verify_payment(payment_method, total, payment_meta)

    order_id = str(uuid.uuid4())
    order_doc = {
        "_id": order_id,
        "customer_id": user["_id"],
        "shop_id": shop_id,
        "items": order_items,
        "total": round(total, 2),
        "status": "paid" if verification["status"] == "confirmed" else "created",
        "payment_status": verification["status"],
        "payment_method": payment_method,
        "idempotency_key": idempotency_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.orders.insert_one(order_doc)

    db.payments.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "order_id": order_id,
            "provider": payment_provider,
            "payment_method": payment_method,
            "status": verification["status"],
            "amount": round(total, 2),
            "payment_meta": payment_meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    if payment_method == "credit":
        _update_credit_ledger(user["_id"], shop_id, round(total, 2), order_id)

    db.carts.update_one({"customer_id": user["_id"]}, {"$set": {"items": []}}, upsert=True)
    remember_idempotency(scope, idempotency_key, order_id)
    audit_log("customer_checkout", actor_id=user["_id"], metadata={"order_id": order_id, "shop_id": shop_id})
    return order_doc


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
):
    db = get_db()
    if operator["role"] == "shopkeeper" and shop_id not in operator.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned to this shop")

    scope = {"shop_id": shop_id, "flow": "pos_checkout", "operator_id": operator["_id"]}
    if (existing := ensure_idempotency(scope, idempotency_key)):
        return existing

    order_items = []
    subtotal_total = 0.0
    for item in items:
        product = db.products.find_one({"_id": item["product_id"], "shop_id": shop_id})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product["stock"] < item["qty"]:
            raise HTTPException(status_code=400, detail="Insufficient stock")

    for item in items:
        product = db.products.find_one({"_id": item["product_id"]})
        updated = db.products.update_one(
            {"_id": product["_id"], "stock": {"$gte": item["qty"]}},
            {"$inc": {"stock": -item["qty"]}},
        )
        if updated.modified_count == 0:
            raise HTTPException(status_code=400, detail="Insufficient stock")

        subtotal = product["price"] * item["qty"]
        subtotal_total += subtotal
        order_items.append({"product_id": product["_id"], "qty": item["qty"], "price": product["price"], "subtotal": subtotal})

    tax_amount = (tax_percent / 100.0) * subtotal_total
    total = max(round(subtotal_total + tax_amount - discount, 2), 0)
    verification = verify_payment(payment_method, total, payment_meta)

    order_id = str(uuid.uuid4())
    order_doc = {
        "_id": order_id,
        "customer_id": None,
        "shop_id": shop_id,
        "items": order_items,
        "subtotal": round(subtotal_total, 2),
        "tax_percent": tax_percent,
        "tax_amount": round(tax_amount, 2),
        "discount": round(discount, 2),
        "total": total,
        "status": "paid" if verification["status"] == "confirmed" else "created",
        "payment_status": verification["status"],
        "payment_method": payment_method,
        "idempotency_key": idempotency_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": operator["_id"],
    }
    db.orders.insert_one(order_doc)

    db.payments.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "order_id": order_id,
            "provider": payment_provider,
            "payment_method": payment_method,
            "status": verification["status"],
            "amount": total,
            "payment_meta": payment_meta or {},
        }
    )
    remember_idempotency(scope, idempotency_key, order_id)
    audit_log("pos_checkout", actor_id=operator["_id"], metadata={"order_id": order_id, "shop_id": shop_id})
    return order_doc
