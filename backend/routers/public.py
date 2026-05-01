from fastapi import APIRouter, Query
from backend.db.mongo import get_db
from backend.services.geo import haversine_km

router = APIRouter(prefix="/api/public", tags=["Marketplace"])


# =========================
# PLAN HELPERS
# =========================
def can_sell_online(shop):
    return shop.get("subscription_plan") in ["online", "enterprise"]


# =========================
# HOME
# =========================
@router.get("/home")
def home():
    db = get_db()

    shops = list(db.shops.find({}))
    
    # 🔒 ONLY ONLINE-ALLOWED SHOPS
    online_shops = [s for s in shops if can_sell_online(s)]
    shop_ids = [s["_id"] for s in online_shops]

    featured = list(
        db.products.find(
            {
                "is_public": True,
                "shop_id": {"$in": shop_ids},
            }
        ).limit(8)
    )

    return {
        "hero": "Welcome to Dukani",
        "featured": featured,
    }


# =========================
# CATEGORIES
# =========================
@router.get("/categories")
def categories():
    db = get_db()

    return sorted(
        db.products.distinct(
            "category",
            {
                "is_public": True,
                "category": {"$nin": [None, ""]},
            },
        )
    )


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

    filters = {"is_public": True}

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

    # 🔒 FILTER BY SHOP SUBSCRIPTION PLAN
    valid_products = []

    for p in products:
        shop = db.shops.find_one({"_id": p.get("shop_id")})

        if not shop:
            continue

        if can_sell_online(shop):
            valid_products.append(p)

    return valid_products


# =========================
# NEARBY SHOPS
# =========================
@router.get("/shops/nearby")
def nearby_shops(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    db = get_db()

    shops = list(db.shops.find({}))

    ranked = []

    for shop in shops:
        # 🔒 ONLY SHOW ONLINE-ALLOWED SHOPS
        if not can_sell_online(shop):
            continue

        try:
            shop_lat = float(shop["latitude"])
            shop_lng = float(shop["longitude"])
        except (TypeError, ValueError, KeyError):
            continue

        distance_km = haversine_km(lat, lng, shop_lat, shop_lng)

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
