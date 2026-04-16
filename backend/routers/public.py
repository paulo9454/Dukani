from fastapi import APIRouter, Query
from backend.db.mongo import get_db
from backend.services.checkout import shop_online_enabled

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/categories")
def list_public_categories():
    db = get_db()
    return list(db.categories.find({}))


@router.get("/products")
def list_public_products(category: str | None = Query(default=None)):
    db = get_db()
    online_shop_ids = [s["_id"] for s in db.shops.find({}) if shop_online_enabled(s["_id"])]
    filters = {"is_public": True, "shop_id": {"$in": online_shop_ids}}
    if category:
        filters["$or"] = [
            {"category": category},
            {"category_id": category},
            {"category_name": category},
        ]
    return list(db.products.find(filters))
