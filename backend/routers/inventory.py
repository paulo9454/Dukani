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

    products = list(
        db.products.find({
            "shop_id": shop_id,
            "stock": {"$lte": threshold},
        })
    )

    return {
        "shop_id": shop_id,
        "threshold": threshold,
        "count": len(products),
        "low_stock_items": products,
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
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop_id = payload.get("shop_id")
    product_id = payload.get("product_id")
    qty = float(payload.get("qty", 0))
    total_cost = float(payload.get("total_cost", 0))
    buying_price = float(payload.get("buying_price", 0))

    if not product_id:
        raise HTTPException(400, "product_id required")

    if qty <= 0:
        raise HTTPException(400, "Invalid quantity")

    product_query = {"_id": product_id}
    if shop_id:
        product_query["shop_id"] = shop_id
    product = db.products.find_one(product_query)

    if not product:
        raise HTTPException(404, "Product not found")

    # 🔐 Tenant guard — restock only allowed for shops the caller owns or
    # is assigned to. Use the product's actual shop, not what the client
    # claimed in the body.
    assert_shop_access(user, product["shop_id"])

    old_stock = float(product.get("stock", 0))
    old_buy = float(product.get("buying_price", 0))

    new_stock = old_stock + qty

    # =========================
    # 💰 WEIGHTED BUYING PRICE
    # =========================
    if new_stock > 0:
        new_buying_price = (
            (old_stock * old_buy) + (qty * buying_price)
        ) / new_stock
    else:
        new_buying_price = buying_price

    # =========================
    # UPDATE PRODUCT
    # =========================
    db.products.update_one(
        {"_id": product_id},
        {
            "$set": {
                "stock": new_stock,
                "buying_price": round(new_buying_price, 2),
                "updated_at": now(),
            }
        }
    )

    # =========================
    # 💸 CAPITAL LOG
    # =========================
    db.inventory_movements.insert_one({
        "_id": str(uuid.uuid4()),
        "shop_id": product.get("shop_id"),
        "product_id": product_id,
        "type": "RESTOCK",
        "qty": qty,
        "total_cost": total_cost,
        "buying_price": buying_price,
        "created_at": now(),
    })

    return {
        "message": "Restock successful",
        "product_id": product_id,
        "new_stock": new_stock,
        "new_buying_price": round(new_buying_price, 2),
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
