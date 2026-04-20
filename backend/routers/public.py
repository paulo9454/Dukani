from fastapi import APIRouter, Query
from backend.db.mongo import get_db
from backend.services.geo import haversine_km

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


@router.get("/shops/nearby")
def nearby_shops(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    db = get_db()
    shops = list(db.shops.find({"latitude": {"$exists": True}, "longitude": {"$exists": True}}))

    ranked = []
    for shop in shops:
        try:
            shop_lat = float(shop["latitude"])
            shop_lng = float(shop["longitude"])
        except (TypeError, ValueError):
            continue

        if not (-90 <= shop_lat <= 90 and -180 <= shop_lng <= 180):
            continue

        distance_km = haversine_km(
            lat,
            lng,
            shop_lat,
            shop_lng,
        )
        ranked.append(
            {
                "_id": shop.get("_id"),
                "name": shop.get("name"),
                "category": shop.get("category"),
                "address": shop.get("address"),
                "latitude": shop.get("latitude"),
                "longitude": shop.get("longitude"),
                "distance_km": round(distance_km, 3),
            }
        )

    return sorted(ranked, key=lambda s: s["distance_km"])
