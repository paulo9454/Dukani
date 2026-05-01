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
