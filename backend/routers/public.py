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
    categories = db.products.distinct(
        "category",
        {
            "is_public": True,
            "is_online": True,
            "category": {"$nin": [None, ""]},
        },
    )
    return sorted(categories)


# =========================
# PRODUCTS (MARKETPLACE ONLY)
# =========================
@router.get("/products")
def public_products(
    category: str | None = Query(default=None),
    shop_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    db = get_db()

    filters = {"is_public": True, "is_online": True}

    if category:
        filters["category"] = category

    if shop_id:
        filters["shop_id"] = shop_id

    if q:
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    products = list(db.products.find(filters))
    if not products:
        return []

    candidate_shop_ids = list({p.get("shop_id") for p in products if p.get("shop_id")})
    if not candidate_shop_ids:
        return []

    active_shops = list(
        db.shops.find(
            {
                "_id": {"$in": candidate_shop_ids},
                "$or": [
                    {"online_enabled": True},
                    {"is_public": True},
                ],
            },
            {"_id": 1},
        )
    )
    active_shop_ids = {s["_id"] for s in active_shops}
    if not active_shop_ids:
        return []

    return [p for p in products if p.get("shop_id") in active_shop_ids]


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
