from fastapi import APIRouter, Query
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/categories")
def list_public_categories():
    db = get_db()
    return list(db.categories.find({}))


@router.get("/products")
def list_public_products(category: str | None = Query(default=None)):
    db = get_db()
    filters = {"is_public": True}
    if category:
        filters["$or"] = [
            {"category": category},
            {"category_id": category},
            {"category_name": category},
        ]
    return list(db.products.find(filters))
