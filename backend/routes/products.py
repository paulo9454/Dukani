from fastapi import APIRouter, Depends, HTTPException, Query
from backend.db.mongo import get_db
from backend.core.deps import require_roles
from backend.schemas.product import ProductCreate, ProductUpdate, CategoryCreate
from backend.services.safe_query import safe_str
import uuid

router = APIRouter(prefix="/api/products", tags=["products"])


# =========================
# LIST PRODUCTS (SHOP SCOPED + AUTH)
# =========================
@router.get("")
def list_products(
    q: str | None = Query(default=None),
    barcode: str | None = Query(default=None),
    shop_id: str | None = Query(default=None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper", "customer"))
):
    db = get_db()

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")

    filters = {"shop_id": shop_id}

    if barcode:
        filters["barcode"] = safe_str(barcode, "barcode")

    if q:
        q = safe_str(q, "q")
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}}
        ]

    return list(db.products.find(filters))


# =========================
# CREATE PRODUCT
# =========================
@router.post("", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def create_product(
    payload: ProductCreate,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))
):
    db = get_db()

    doc = payload.model_dump()
    doc["_id"] = str(uuid.uuid4())

    db.products.insert_one(doc)
    return doc


# =========================
# UPDATE PRODUCT
# =========================
@router.put("/{product_id}", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def update_product(product_id: str, payload: ProductUpdate):
    db = get_db()

    existing = db.products.find_one({"_id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    data = {k: v for k, v in payload.model_dump().items() if v is not None}

    db.products.update_one({"_id": product_id}, {"$set": data})

    return db.products.find_one({"_id": product_id})


# =========================
# DELETE PRODUCT
# =========================
@router.delete("/{product_id}", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def delete_product(product_id: str):
    db = get_db()

    existing = db.products.find_one({"_id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    db.products.delete_one({"_id": product_id})

    return {"message": "Deleted"}


# =========================
# CATEGORIES
# =========================
@router.get("/categories/list")
def list_categories():
    db = get_db()
    return list(db.categories.find({}))


@router.post("/categories/list", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def create_category(payload: CategoryCreate):
    db = get_db()

    doc = {
        "_id": str(uuid.uuid4()),
        "name": payload.name
    }

    db.categories.insert_one(doc)
    return doc
