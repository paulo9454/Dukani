from fastapi import APIRouter, Query
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/public", tags=["Marketplace"])


# =========================
# HOME
# =========================
@router.get("/home")
def home():
    db = get_db()

    shops = list(db.shops.find({"online_enabled": True}))
    shop_ids = [s["_id"] for s in shops]

    featured = list(db.products.find(
        {
            "is_public": True,
            "is_online": True,
            "shop_id": {"$in": shop_ids},
        }
    ).limit(8))

    return {
        "hero": "Welcome to Dukani",
        "featured": featured
    }


# =========================
# CATEGORIES
# =========================
@router.get("/categories")
def categories():
    db = get_db()

    return db.shops.distinct(
        "category",
        {"online_enabled": True, "category": {"$ne": None}}
    )


# =========================
# PRODUCTS (MARKETPLACE ONLY)
# =========================
@router.get("/products")
def public_products(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    db = get_db()

    shops = list(db.shops.find({"online_enabled": True}))
    shop_ids = [s["_id"] for s in shops]

    if not shop_ids:
        return []

    filters = {
        "shop_id": {"$in": shop_ids},
        "is_public": True,
        "is_online": True,
    }

    if category:
        filters["category"] = category

    if q:
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    return list(db.products.find(filters))
