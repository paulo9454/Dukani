from fastapi import APIRouter, Query
from backend.db.mongo import get_db
from backend.services.visibility import is_product_visible
from backend.services.safe_query import safe_str

router = APIRouter(prefix="/api/public", tags=["public"])


# =========================
# 📂 CATEGORIES (ONLY VALID ONLINE SHOPS)
# =========================
@router.get("/categories")
def list_public_categories():
    db = get_db()

    categories = db.shops.distinct(
        "category",
        {
            "online_enabled": True,
            "category": {"$ne": None}
        }
    )

    # remove null/empty values
    return [c for c in categories if c]


# =========================
# 🏪 SHOPS BY CATEGORY
# =========================
@router.get("/shops")
def list_public_shops(category: str | None = Query(default=None)):
    db = get_db()

    filters = {
        "online_enabled": True,
        "category": {"$ne": None}
    }

    if category:
        filters["category"] = category

    return list(db.shops.find(filters))


# =========================
# 📦 PRODUCTS (FINAL MARKETPLACE ENGINE)
# =========================
@router.get("/products")
def list_public_products(
    category: str | None = Query(default=None),
    shop_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    db = get_db()

    # =========================
    # 1. FILTER VALID ONLINE SHOPS
    # =========================
    shop_filter = {
        "online_enabled": True,
        "category": {"$ne": None}
    }

    if category:
        shop_filter["category"] = category

    if shop_id:
        shop_filter["_id"] = shop_id

    shops = list(db.shops.find(shop_filter, {"_id": 1, "category": 1, "online_enabled": 1}))
    if not shops:
        return []

    shop_map = {s["_id"]: s for s in shops}
    shop_ids = list(shop_map.keys())

    # =========================
    # 2. FILTER PRODUCTS (LIGHT QUERY)
    # =========================
    product_filter = {
        "shop_id": {"$in": shop_ids}
    }

    if q:
        q = safe_str(q, "q")
        product_filter["name"] = {"$regex": q, "$options": "i"}

    products = db.products.find(product_filter)

    # =========================
    # 3. FINAL VISIBILITY ENGINE
    # =========================
    result = []

    for p in products:
        shop = shop_map.get(p["shop_id"])
        if not shop:
            continue

        if is_product_visible(p, shop, mode="marketplace"):
            result.append(p)

    return result
