from fastapi import APIRouter
from backend.db.mongo import get_db
from backend.services.checkout import shop_online_enabled

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/home")
def home():
    db = get_db()
    online_shop_ids = [s["_id"] for s in db.shops.find({}) if shop_online_enabled(s["_id"])]
    featured = list(
        db.products.find({"is_public": True, "shop_id": {"$in": online_shop_ids}}, {"_id": 1, "name": 1, "price": 1}).limit(8)
    )
    return {"hero": "Welcome to Dukani", "featured": featured}


@router.get("/categories")
def categories():
    db = get_db()
    return list(db.categories.find({}))


@router.get("/products")
def public_products():
    db = get_db()
    online_shop_ids = [s["_id"] for s in db.shops.find({}) if shop_online_enabled(s["_id"])]
    return list(db.products.find({"is_public": True, "shop_id": {"$in": online_shop_ids}}))
