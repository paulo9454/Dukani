from fastapi import APIRouter, Depends, HTTPException, Query
from backend.db.mongo import get_db
from backend.core.deps import (
    get_current_user,
    require_roles,
    assert_shop_access,
    get_owned_shop_ids,
    get_assigned_shop_ids,
)
from datetime import datetime, timezone
import uuid
import math
import os
from contextlib import nullcontext

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


# =========================
# UTILS
# =========================
def now():
    return datetime.now(timezone.utc).isoformat()


# =========================
# 🔒 OWNER INVENTORY DASHBOARD
# =========================
@router.get("/shop/{shop_id}")
def get_inventory(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    assert_shop_access(user, shop_id)

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(404, "Shop not found")

    products = list(db.products.find({"shop_id": shop_id}))

    return {
        "shop_id": shop_id,
        "total_products": len(products),
        "products": products,
    }


# =========================
# 🔔 LOW STOCK ALERTS (OWNER ONLY)
# =========================
@router.get("/low-stock/{shop_id}")
def low_stock(
    shop_id: str,
    threshold: int = Query(default=5),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    assert_shop_access(user, shop_id)

    products = list(db.products.find({"shop_id": shop_id}))
    low_items = []
    for p in products:
        ptype = p.get("product_type") or "standard"
        prod_threshold = int(p.get("low_stock_threshold", threshold) or threshold)

        if ptype == "unit_based":
            base_qty = float(p.get("base_stock_quantity", 0) or 0)
            units = p.get("selling_units") or []
            unit_qtys = [
                float(u.get("quantity") or 0)
                for u in units
                if float(u.get("quantity") or 0) > 0
            ]
            smallest = min(unit_qtys) if unit_qtys else 0
            packs_left = int(base_qty // smallest) if smallest else 0
            if packs_left <= prod_threshold:
                p["_low_stock_remaining"] = packs_left
                p["_low_stock_label"] = (
                    "sold out" if packs_left <= 0 else f"{packs_left} packs left"
                )
                low_items.append(p)
        elif ptype == "variant":
            low_variants = []
            for v in p.get("variants") or []:
                v_stock = int(v.get("stock", 0) or 0)
                v_threshold = int(
                    v.get("low_stock_threshold", prod_threshold) or prod_threshold,
                )
                if v_stock <= v_threshold:
                    low_variants.append(
                        {
                            "name": v.get("name"),
                            "stock": v_stock,
                            "threshold": v_threshold,
                        }
                    )
            if low_variants:
                p["_low_variants"] = low_variants
                p["_low_stock_label"] = ", ".join(
                    f"{lv['name']} ({lv['stock']})" for lv in low_variants
                )
                low_items.append(p)
        else:
            stock = int(p.get("stock", 0) or 0)
            if stock <= prod_threshold:
                p["_low_stock_remaining"] = stock
                p["_low_stock_label"] = (
                    "sold out" if stock <= 0 else f"{stock} left"
                )
                low_items.append(p)

    return {
        "shop_id": shop_id,
        "threshold": threshold,
        "count": len(low_items),
        "low_stock_items": low_items,
    }


# =========================
# 🔁 RESTOCK REQUEST
# =========================
@router.post("/restock-request")
def request_restock(
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop_id = payload.get("shop_id")
    product_id = payload.get("product_id")
    qty = payload.get("qty", 0)

    if not shop_id or not product_id:
        raise HTTPException(400, "shop_id and product_id required")

    assert_shop_access(user, shop_id)

    # Make sure the product actually belongs to that shop.
    if not db.products.find_one({"_id": product_id, "shop_id": shop_id}, {"_id": 1}):
        raise HTTPException(404, "Product not found in this shop")

    request = {
        "_id": str(uuid.uuid4()),
        "shop_id": shop_id,
        "product_id": product_id,
        "qty": qty,
        "status": "pending",
        "created_by": user["_id"],
        "created_at": now(),
    }

    db.restock_requests.insert_one(request)

    return {
        "message": "Restock request created",
        "request": request,
    }


# =========================
# 🚚 SUPPLIER LINKING (FOUNDATION)
# =========================
@router.post("/link-supplier")
def link_supplier(
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    shop_id = payload.get("shop_id")
    supplier_id = payload.get("supplier_id")

    if not shop_id or not supplier_id:
        raise HTTPException(400, "shop_id and supplier_id required")

    assert_shop_access(user, shop_id)

    link = {
        "_id": str(uuid.uuid4()),
        "shop_id": shop_id,
        "supplier_id": supplier_id,
        "created_at": now(),
    }

    db.shop_suppliers.insert_one(link)

    return {
        "message": "Supplier linked successfully",
        "link": link,
    }


# =========================
# 🧾 INVENTORY SUMMARY (OWNER OVERVIEW)
# =========================
@router.get("/summary/{shop_id}")
def inventory_summary(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    assert_shop_access(user, shop_id)

    products = list(db.products.find({"shop_id": shop_id}))

    total_stock_value = sum(
        (p.get("price", 0) * p.get("stock", 0)) for p in products
    )

    low_stock_count = len([p for p in products if p.get("stock", 0) <= 5])

    return {
        "shop_id": shop_id,
        "total_products": len(products),
        "low_stock_items": low_stock_count,
        "stock_value": total_stock_value,
    }
    
    # =========================
# 📦 REAL RESTOCK EXECUTION (CAPITAL TRACKING)
# =========================
@router.post("/restock")
def restock_product(
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    product_id = payload.get("product_id")
    if not product_id:
        raise HTTPException(400, "product_id required")

    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(404, "Product not found")

    # Always authorize against the product's actual shop. A client-supplied
    # shop_id is only an additional consistency check, never the authority.
    supplied_shop_id = payload.get("shop_id")
    if supplied_shop_id and supplied_shop_id != product.get("shop_id"):
        raise HTTPException(404, "Product not found")
    assert_shop_access(user, product["shop_id"])

    ptype = product.get("product_type") or "standard"
    total_cost = payload.get("total_cost")
    try:
        total_cost = float(total_cost)
    except (TypeError, ValueError):
        raise HTTPException(400, "A valid total_cost is required")
    if not math.isfinite(total_cost) or total_cost <= 0:
        raise HTTPException(400, "Total cost must be a finite number greater than zero")

    # Compare-and-set retries keep the weighted buying price in sync with the
    # exact stock/cost snapshot being updated. This prevents a concurrent sale
    # or another restock from being overwritten by a stale read.
    max_attempts = 10
    response = None
    movement = {
        "_id": str(uuid.uuid4()),
        "shop_id": product.get("shop_id"),
        "product_id": product_id,
        "type": "RESTOCK",
        "total_cost": round(total_cost, 2),
        "created_at": now(),
        "product_type": ptype,
    }

    def snapshot_condition(document, field):
        if field in document:
            return {field: document[field]}
        return {field: {"$exists": False}}

    # Atlas MongoDB deployments run as replica sets and support multi-document
    # transactions. mongomock does not implement sessions, so tests use the same
    # operations without a transaction; production always requires a transaction.
    session_context = (
        nullcontext(None)
        if os.getenv("TESTING", "0") == "1"
        else db.client.start_session()
    )
    with session_context as session:
        session_kwargs = {"session": session} if session is not None else {}
        transaction_context = session.start_transaction() if session is not None else nullcontext()
        with transaction_context:
        for _ in range(max_attempts):
            product = db.products.find_one(
                {"_id": product_id, "shop_id": product["shop_id"]},
                **session_kwargs,
            )
            if not product:
                raise HTTPException(404, "Product not found")
    
            if ptype == "standard":
                try:
                    qty = float(payload.get("qty"))
                    buying_price = float(payload.get("buying_price"))
                except (TypeError, ValueError):
                    raise HTTPException(400, "Valid qty and buying_price are required")
                if not math.isfinite(qty) or not math.isfinite(buying_price) or qty <= 0 or buying_price <= 0:
                    raise HTTPException(400, "Quantity and buying price must be finite numbers greater than zero")
    
                old_stock_raw = product.get("stock")
                old_buy_raw = product.get("buying_price")
                old_stock = float(old_stock_raw or 0)
                old_buy = float(old_buy_raw or 0)
                new_stock = old_stock + qty
                new_buy = ((old_stock * old_buy) + (qty * buying_price)) / new_stock
                query = {"_id": product_id, "shop_id": product["shop_id"]}
                query.update(snapshot_condition(product, "stock"))
                query.update(snapshot_condition(product, "buying_price"))
                updated = db.products.update_one(
                    query,
                    {"$inc": {"stock": qty},
                     "$set": {"buying_price": round(new_buy, 2), "updated_at": now()}},
                    **session_kwargs,
                )
                if updated.modified_count:
                    movement.update({"qty": qty, "buying_price": round(buying_price, 2)})
                    response = {
                        "new_stock": new_stock,
                        "new_buying_price": round(new_buy, 2),
                    }
                    break
    
            elif ptype == "variant":
                variant_name = str(payload.get("variant_name") or "").strip()
                try:
                    qty = float(payload.get("qty"))
                    buying_price = float(payload.get("buying_price"))
                except (TypeError, ValueError):
                    raise HTTPException(400, "Select a variant and enter valid quantity and buying price")
                if not variant_name:
                    raise HTTPException(400, "variant_name required")
                if not math.isfinite(qty) or not math.isfinite(buying_price) or qty <= 0 or buying_price <= 0:
                    raise HTTPException(400, "Quantity and buying price must be finite numbers greater than zero")
    
                variants = product.get("variants") or []
                variant = next((v for v in variants if v.get("name") == variant_name), None)
                if variant is None:
                    raise HTTPException(404, "Variant not found")
                old_stock = float(variant.get("stock", 0) or 0)
                old_buy = float(variant.get("buying_price", product.get("buying_price", 0)) or 0)
                new_stock = old_stock + qty
                new_buy = ((old_stock * old_buy) + (qty * buying_price)) / new_stock
                variant_match = {"name": variant_name}
                variant_match.update(snapshot_condition(variant, "stock"))
                query = {"_id": product_id, "shop_id": product["shop_id"]}
                if "buying_price" in variant:
                    variant_match.update(snapshot_condition(variant, "buying_price"))
                else:
                    variant_match["buying_price"] = {"$exists": False}
                    # When this variant inherits the product-level cost, include
                    # that fallback value in the compare-and-set snapshot too.
                    query.update(snapshot_condition(product, "buying_price"))
                query["variants"] = {"$elemMatch": variant_match}
                updated = db.products.update_one(
                    query,
                    {"$inc": {"variants.$.stock": qty},
                     "$set": {"variants.$.buying_price": round(new_buy, 2), "updated_at": now()}},
                    **session_kwargs,
                )
                if updated.modified_count:
                    movement.update({
                        "qty": qty, "buying_price": round(buying_price, 2),
                        "variant_name": variant_name,
                    })
                    response = {
                        "variant_name": variant_name,
                        "new_stock": new_stock,
                        "new_buying_price": round(new_buy, 2),
                    }
                    break
    
            elif ptype == "unit_based":
                try:
                    base_quantity = float(payload.get("base_quantity"))
                    buying_price = float(payload.get("buying_price"))
                except (TypeError, ValueError):
                    raise HTTPException(400, "Valid base_quantity and buying_price are required")
                if not math.isfinite(base_quantity) or not math.isfinite(buying_price) or base_quantity <= 0 or buying_price <= 0:
                    raise HTTPException(400, "Quantity and buying price must be finite numbers greater than zero")
                if product.get("base_unit") not in {"g", "kg", "ml", "litre", "l"}:
                    raise HTTPException(400, "Product has an invalid base unit")
    
                # Checkout values unit-based buying_price per kg/litre. Stock itself
                # is stored in grams/ml, so convert only for the weighted-cost math.
                old_base_raw = product.get("base_stock_quantity")
                old_buy_raw = product.get("buying_price")
                old_base = float(old_base_raw or 0)
                old_buy = float(old_buy_raw or 0)
                added_standard_units = base_quantity / 1000.0
                old_standard_units = old_base / 1000.0
                total_standard_units = old_standard_units + added_standard_units
                new_buy = (
                    (old_standard_units * old_buy) + (added_standard_units * buying_price)
                ) / total_standard_units
                query = {"_id": product_id, "shop_id": product["shop_id"]}
                query.update(snapshot_condition(product, "base_stock_quantity"))
                query.update(snapshot_condition(product, "buying_price"))
                updated = db.products.update_one(
                    query,
                    {"$inc": {"base_stock_quantity": base_quantity},
                     "$set": {"buying_price": round(new_buy, 2), "updated_at": now()}},
                )
                if updated.modified_count:
                    movement.update({
                        "qty": base_quantity,
                        "base_unit": product.get("base_unit"),
                        "buying_price": round(buying_price, 2),
                    })
                    response = {
                        "new_base_stock_quantity": old_base + base_quantity,
                        "new_buying_price": round(new_buy, 2),
                        "base_unit": product.get("base_unit"),
                    }
                    break
    
            else:
                raise HTTPException(400, "Unsupported product type")
    
        if response is None:
            raise HTTPException(
                409,
                "Stock changed repeatedly while restocking; refresh the product and try again",
            )
    
        db.inventory_movements.insert_one(movement, **session_kwargs)
        return {
        "message": "Restock successful",
        "product_id": product_id,
        **response,
    }

    # =========================
# 📊 PROFIT + CAPITAL DASHBOARD
# =========================
@router.get("/analytics/{shop_id}")
def profit_capital_dashboard(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    assert_shop_access(user, shop_id)

    # =========================
    # 📦 PRODUCTS
    # =========================
    products = list(db.products.find({"shop_id": shop_id}))

    # =========================
    # 💰 ORDERS (REVENUE + PROFIT BASE)
    # =========================
    orders = list(db.orders.find({
        "shop_id": shop_id,
        "payment_status": "confirmed"
    }))

    revenue = 0
    cogs = 0

    for order in orders:
        revenue += float(order.get("total", 0))

        for item in order.get("items", []):
            product = db.products.find_one({"_id": item["product_id"]})
            if not product:
                continue

            buying_price = float(product.get("buying_price", 0))
            cogs += buying_price * float(item.get("qty", 0))

    profit = revenue - cogs

    # =========================
    # 💸 CAPITAL INVESTED (RESTOCK)
    # =========================
    restocks = list(db.inventory_movements.find({
        "shop_id": shop_id,
        "type": "RESTOCK"
    }))

    capital_invested = sum(
        float(r.get("total_cost", 0)) for r in restocks
    )

    # =========================
    # 📦 STOCK VALUE
    # =========================
    stock_value = sum(
        float(p.get("stock", 0)) * float(p.get("buying_price", 0))
        for p in products
    )

    # =========================
    # 📊 LOW STOCK COUNT
    # =========================
    low_stock = len([
        p for p in products
        if float(p.get("stock", 0)) <= float(p.get("low_stock_threshold", 5))
    ])

    return {
        "shop_id": shop_id,

        # 💰 SALES
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "profit": round(profit, 2),

        # 💸 CAPITAL
        "capital_invested": round(capital_invested, 2),
        "stock_value": round(stock_value, 2),

        # 📦 INVENTORY HEALTH
        "total_products": len(products),
        "low_stock_items": low_stock,
    }
