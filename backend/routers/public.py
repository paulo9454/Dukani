from fastapi import APIRouter, Query, HTTPException
from backend.db.mongo import get_db
from backend.services.geo import haversine_km
from backend.services.slug import slugify, ensure_unique_slug

router = APIRouter(prefix="/api/public", tags=["Marketplace"])


# =========================
# PLAN HELPERS
# =========================
def _online_eligible(shop: dict) -> bool:
    plan = shop.get("subscription_plan")
    if plan in {"pos_online", "online", "enterprise"}:
        return True
    # legacy flag still respected
    return bool(shop.get("is_online_enabled") or shop.get("online_enabled"))


def _ensure_slug(db, shop: dict) -> str:
    slug = shop.get("slug")
    if slug:
        return slug
    slug = ensure_unique_slug(db, slugify(shop.get("name") or shop["_id"]))
    db.shops.update_one({"_id": shop["_id"]}, {"$set": {"slug": slug}})
    return slug


def _public_shop_view(shop: dict, slug: str) -> dict:
    mpesa_configured = bool(
        shop.get("mpesa_consumer_key")
        and shop.get("mpesa_consumer_secret")
        and shop.get("mpesa_shortcode")
        and shop.get("mpesa_passkey")
    )
    return {
        "_id": shop["_id"],
        "slug": slug,
        "name": shop.get("name"),
        "description": shop.get("description"),
        "logo": shop.get("logo"),
        "category": shop.get("category"),
        "address": shop.get("address"),
        "latitude": shop.get("latitude"),
        "longitude": shop.get("longitude"),
        "subscription_plan": shop.get("subscription_plan"),
        # Payment capabilities — customer-safe (no secrets, never).
        "mpesa_configured": mpesa_configured,
        "mpesa_till_number": shop.get("mpesa_till_number") or "",
        "mpesa_paybill_number": shop.get("mpesa_paybill_number") or "",
        "mpesa_account_name": shop.get("mpesa_account_name") or shop.get("name") or "",
    }


# =========================
# HOME
# =========================
@router.get("/home")
def home():
    db = get_db()
    shops = [s for s in db.shops.find({}) if _online_eligible(s)]
    shop_ids = [s["_id"] for s in shops]
    featured = list(
        db.products.find({"is_public": True, "shop_id": {"$in": shop_ids}}).limit(8)
    )
    return {"hero": "Welcome to Dukayko", "featured": featured}


# =========================
# CATEGORIES
# =========================
@router.get("/categories")
def categories():
    db = get_db()
    return sorted(
        db.products.distinct(
            "category",
            {"is_public": True, "category": {"$nin": [None, ""]}},
        )
    )


# =========================
# PRODUCTS (MARKETPLACE — global filter)
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
    valid = []
    for p in products:
        shop = db.shops.find_one({"_id": p.get("shop_id")})
        if shop and _online_eligible(shop):
            valid.append(p)
    return valid


# =========================
# PUBLIC SHOPS LIST (online only)
# =========================
@router.get("/shops")
def list_public_shops():
    db = get_db()
    out = []
    for s in db.shops.find({}):
        if not _online_eligible(s):
            continue
        slug = _ensure_slug(db, s)
        out.append(_public_shop_view(s, slug))
    return out


# =========================
# PUBLIC SHOP BY SLUG  (Shopify-style /shop/{slug})
# =========================
@router.get("/shop/{slug}")
def public_shop_by_slug(slug: str):
    db = get_db()
    shop = db.shops.find_one({"slug": slug})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _online_eligible(shop):
        raise HTTPException(status_code=403, detail="This shop is not currently selling online")
    return _public_shop_view(shop, slug)


@router.get("/shop/{slug}/products")
def public_shop_products(
    slug: str,
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    db = get_db()
    shop = db.shops.find_one({"slug": slug})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _online_eligible(shop):
        raise HTTPException(status_code=403, detail="This shop is not currently selling online")
    filters = {"shop_id": shop["_id"], "is_public": True}
    if category:
        filters["category"] = category
    if q:
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    total = db.products.count_documents(filters)
    skip = (page - 1) * limit
    items = list(db.products.find(filters).skip(skip).limit(limit))
    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": total,
        "has_more": skip + len(items) < total,
    }


# =========================
# NEARBY SHOPS
# =========================
@router.get("/shops/nearby")
def nearby_shops(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    db = get_db()
    ranked = []
    for shop in db.shops.find({}):
        if not _online_eligible(shop):
            continue
        try:
            shop_lat = float(shop["latitude"])
            shop_lng = float(shop["longitude"])
        except (TypeError, ValueError, KeyError):
            continue
        distance_km = haversine_km(lat, lng, shop_lat, shop_lng)
        slug = _ensure_slug(db, shop)
        ranked.append({
            "_id": shop.get("_id"),
            "slug": slug,
            "name": shop.get("name"),
            "category": shop.get("category"),
            "address": shop.get("address"),
            "latitude": shop.get("latitude"),
            "longitude": shop.get("longitude"),
            "distance_km": round(distance_km, 3),
        })
    return sorted(ranked, key=lambda s: s["distance_km"])
