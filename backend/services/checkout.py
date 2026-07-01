from fastapi import HTTPException
from backend.db.mongo import get_db
from backend.services.payment_verifier import verify_payment
from backend.services.customer_accounts import apply_credit_sale_to_account
from backend.services.receipt import build_receipt
from backend.services.audit import audit_log
from backend.services.subscription_service import get_subscription
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
    try:
        sub = get_subscription(db, shop_id)
        return bool(sub["features"]["online"])
    except HTTPException:
        return False


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
def _normalize_amount(amount, unit):
    """Convert a (number, unit) pair to base unit (g or ml).

    We always store base_stock_quantity in the smallest unit (g for mass,
    ml for volume). The conversion never loses precision because all of
    the supported units divide cleanly.
    """
    amount = float(amount or 0)
    if unit in ("g", "ml"):
        return amount
    if unit in ("kg", "litre", "l"):
        return amount * 1000.0
    return amount


def reserve_stock(db, product_id: str, shop_id: str, item: dict | int):
    """Atomic reservation for ALL three product types.

    Returns a dict: {product, unit_price, qty, unit_label?, unit_quantity?,
    variant_name?, variant_index?}. Raises HTTPException(400) when the
    requested quantity exceeds available stock — the atomic mongo update
    is the source of truth, never a read-then-write check.

    For backward compatibility a plain int can still be passed for `item`
    (legacy POS callers).
    """
    if isinstance(item, int):
        item = {"qty": item}

    qty = int(item.get("qty") or 0)
    if qty <= 0:
        raise HTTPException(400, "Quantity must be > 0")

    product = db.products.find_one({"_id": product_id, "shop_id": shop_id})
    if not product:
        raise HTTPException(404, "Product not found")

    ptype = product.get("product_type") or "standard"

    # ── 🛒 STANDARD ────────────────────────────────────────────────
    if ptype == "standard":
        updated = db.products.update_one(
            {"_id": product_id, "shop_id": shop_id, "stock": {"$gte": qty}},
            {"$inc": {"stock": -qty, "reserved": qty}},
        )
        if updated.modified_count == 0:
            available = int(product.get("stock") or 0)
            unit = product.get("unit_type") or "in stock"
            if available <= 0:
                msg = f"{product.get('name')} is sold out"
            else:
                msg = f"Only {available} {unit} of {product.get('name')} left"
            raise HTTPException(400, msg)
        return {
            "product": product,
            "unit_price": float(product.get("price", 0)),
            "qty": qty,
        }

    # ── ⚖️  UNIT-BASED (sugar / oil / soap by weight or volume) ──
    if ptype == "unit_based":
        label = (item.get("unit_label") or "").strip()
        if not label:
            raise HTTPException(400, f"{product.get('name')}: pick a selling unit")
        match = next(
            (u for u in (product.get("selling_units") or []) if u.get("label") == label),
            None,
        )
        if not match:
            raise HTTPException(400, f"{product.get('name')}: unit '{label}' not found")
        unit_qty = float(match.get("quantity") or 0)
        if unit_qty <= 0:
            raise HTTPException(400, f"{product.get('name')}: invalid unit '{label}'")
        needed = unit_qty * qty
        unit_price = float(match.get("price") or 0)

        updated = db.products.update_one(
            {
                "_id": product_id,
                "shop_id": shop_id,
                "base_stock_quantity": {"$gte": needed},
            },
            {"$inc": {"base_stock_quantity": -needed, "reserved_base": needed}},
        )
        if updated.modified_count == 0:
            remaining = float(product.get("base_stock_quantity") or 0)
            base_unit = product.get("base_unit") or ""
            packs = int(remaining // unit_qty) if unit_qty else 0
            if packs <= 0:
                msg = f"{product.get('name')} ({label}) is sold out"
            else:
                msg = f"Only {packs} × {label} of {product.get('name')} remaining"
                if base_unit in ("g", "kg") and remaining > 0:
                    msg += f" ({remaining/1000:.2f} kg in stock)"
                elif base_unit in ("ml", "l", "litre") and remaining > 0:
                    msg += f" ({remaining/1000:.2f} L in stock)"
            raise HTTPException(400, msg)
        return {
            "product": product,
            "unit_price": unit_price,
            "qty": qty,
            "unit_label": label,
            "unit_quantity": unit_qty,
        }

    # ── 👕 VARIANT (clothes / shoes / diaper sizes) ───────────────
    if ptype == "variant":
        variant_name = (item.get("variant_name") or "").strip()
        if not variant_name:
            raise HTTPException(400, f"{product.get('name')}: pick a variant")
        variants = product.get("variants") or []
        variant_index = next(
            (idx for idx, v in enumerate(variants) if v.get("name") == variant_name),
            None,
        )
        if variant_index is None:
            raise HTTPException(400, f"{product.get('name')}: variant '{variant_name}' not found")
        variant = variants[variant_index]
        unit_price = float(variant.get("price") or product.get("price") or 0)

        # Atomically decrement only when that specific variant has stock.
        updated = db.products.update_one(
            {
                "_id": product_id,
                "shop_id": shop_id,
                "variants": {
                    "$elemMatch": {"name": variant_name, "stock": {"$gte": qty}}
                },
            },
            {"$inc": {"variants.$.stock": -qty, "variants.$.reserved": qty}},
        )
        if updated.modified_count == 0:
            available = int(variant.get("stock") or 0)
            if available <= 0:
                msg = f"{product.get('name')} ({variant_name}) is sold out"
            else:
                msg = f"Only {available} of {product.get('name')} ({variant_name}) left"
            raise HTTPException(400, msg)
        return {
            "product": product,
            "variant": variant,
            "unit_price": unit_price,
            "qty": qty,
            "variant_name": variant_name,
            "variant_index": variant_index,
        }

    raise HTTPException(400, f"Unknown product_type {ptype!r}")


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
        res = reserve_stock(db, i["product_id"], shop_id, i)
        product = res["product"]
        price = res["unit_price"]
        qty_i = res["qty"]
        subtotal = price * qty_i
        total += subtotal

        line = {
            "product_id": product["_id"],
            "name": product.get("name"),
            "qty": qty_i,
            "price": price,
            "subtotal": subtotal,
        }
        if "unit_label" in res:
            line["unit_label"] = res["unit_label"]
            line["unit_quantity"] = res["unit_quantity"]
        if "variant_name" in res:
            line["variant_name"] = res["variant_name"]
        items.append(line)

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

    shop = db.shops.find_one({"_id": shop_id})
    receipt = build_receipt(order, shop, operator=None)

    return {**order, "receipt": receipt}


# =========================
# POS CHECKOUT
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

    credit_customer_id = None
    if payment_method == "credit":
        credit_customer_id = (payment_meta or {}).get("credit_customer_id")
        if not credit_customer_id:
            raise HTTPException(400, "Customer account is required for credit checkout")
        account = db.credit_customers.find_one({"_id": credit_customer_id, "shop_id": shop_id}, {"_id": 1})
        if not account:
            raise HTTPException(404, "Customer account not found for this shop")

    scope = {
        "shop_id": shop_id,
        "operator_id": operator["_id"],
        "flow": "pos_checkout",
    }

    if existing := ensure_idempotency(scope, idempotency_key):
        return existing

    total_base = 0
    total_profit = 0
    order_items = []

    for i in items:
        res = reserve_stock(db, i["product_id"], shop_id, i)
        product = res["product"]
        qty = res["qty"]
        price_mode = i.get("price_mode", "retail")
        unit_label = res.get("unit_label")
        variant_name = res.get("variant_name")

        if variant_name:
            buying_price = float(
                (res.get("variant") or {}).get(
                    "buying_price",
                    product.get("buying_price", 0),
                )
            )
        else:
            buying_price = float(product.get("buying_price", 0))

        unit_quantity = float(res.get("unit_quantity") or 0)
        if unit_label and unit_quantity > 0:
            base_unit = product.get("base_unit")
            normalized_unit_qty = _normalize_amount(unit_quantity, base_unit)
            cost_total = buying_price * ((normalized_unit_qty * qty) / 1000.0)
        else:
            cost_total = buying_price * qty

        if unit_label or variant_name:
            # For unit-based & variant products the resolved unit_price
            # already accounts for the chosen size — wholesale toggle
            # doesn't apply to those (yet).
            selling_price = res["unit_price"]
        elif price_mode == "wholesale":
            selling_price = float(product.get("wholesale_price", product.get("price", 0)))
        else:
            selling_price = float(product.get("price", 0))

        subtotal = selling_price * qty
        profit = subtotal - cost_total

        total_base += subtotal
        total_profit += profit

        # Re-read product for low-stock notification context.
        updated_product = db.products.find_one({"_id": product["_id"]})
        ptype = product.get("product_type") or "standard"
        if ptype == "standard":
            stock_left = updated_product.get("stock", 0)
        elif ptype == "unit_based":
            stock_left = updated_product.get("base_stock_quantity", 0)
        else:  # variant
            stock_left = next(
                (v.get("stock", 0) for v in (updated_product.get("variants") or [])
                 if v.get("name") == variant_name),
                0,
            )
        threshold = product.get("low_stock_threshold", 5)

        if stock_left <= threshold:
            db.notifications.insert_one({
                "_id": str(uuid.uuid4()),
                "type": "LOW_STOCK",
                "shop_id": shop_id,
                "product_id": product["_id"],
                "message": f"{product.get('name')}{' ('+variant_name+')' if variant_name else ''} low stock",
                "read": False,
                "created_at": now(),
            })

        line = {
            "product_id": product["_id"],
            "name": product.get("name"),
            "qty": qty,
            "unit_type": product.get("unit_type", "piece"),
            "buying_price": buying_price,
            "selling_price": selling_price,
            "price_mode": price_mode,
            "subtotal": subtotal,
            "profit": profit,
        }
        if unit_label:
            line["unit_label"] = unit_label
            line["unit_quantity"] = res.get("unit_quantity")
        if variant_name:
            line["variant_name"] = variant_name
        order_items.append(line)

    tax = (tax_percent / 100) * total_base
    total = max(total_base + tax - discount, 0)

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
        "profit": round2(total_profit),
        "status": status,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "created_by": operator["_id"],
        "created_at": now(),
        "order_source": order_source,
    }

    db.orders.insert_one(order)

    customer_account_result = None
    if payment_method == "credit":
        customer_account_result = apply_credit_sale_to_account(
            db,
            credit_customer_id,
            round2(total),
            order_id,
            user_id=operator["_id"],
        )
        db.orders.update_one(
            {"_id": order_id},
            {"$set": {
                "credit_customer_id": credit_customer_id,
                "customer_account": customer_account_result,
            }},
        )
        order["credit_customer_id"] = credit_customer_id
        order["customer_account"] = customer_account_result

    remember_idempotency(scope, idempotency_key, order_id)

    audit_log(
        "pos_checkout",
        actor_id=operator["_id"],
        metadata={
            "order_id": order_id,
            "profit": total_profit,
        },
    )

    receipt_number = str(uuid.uuid4())[:8]

    return {
        "receipt_number": receipt_number,
        "order_id": order_id,
        "cashier": {
            "id": operator["_id"],
            "name": operator.get("email", "POS User"),
        },
        "items": order_items,
        "subtotal": round2(total_base),
        "tax": round2(tax),
        "discount": round2(discount),
        "total": round2(total),
        "profit": round2(total_profit),
        "payment_status": payment_status,
        "status": status,
        "customer_account": customer_account_result,
    }
