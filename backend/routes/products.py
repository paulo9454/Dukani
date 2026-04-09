from fastapi import APIRouter, Depends, HTTPException, Query
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.schemas.product import CategoryCreate, ProductCreate, ProductUpdate
import uuid
from backend.services.safe_query import safe_str

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("")
def list_products(q: str | None = Query(default=None), barcode: str | None = Query(default=None), shop_id: str | None = Query(default=None)):
    db = get_db()
    filters = {}
    if shop_id:
        filters["shop_id"] = shop_id
    if barcode:
        filters["barcode"] = safe_str(barcode, "barcode")
    if q:
        q = safe_str(q, "q")
        filters["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]
    return list(db.products.find(filters))


@router.post("", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def create_product(payload: ProductCreate, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    if user["role"] == "shopkeeper" and payload.shop_id not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned to this shop")

    db = get_db()
    doc = payload.model_dump()
    doc["_id"] = str(uuid.uuid4())
    db.products.insert_one(doc)
    return doc


@router.put("/{product_id}", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def update_product(product_id: str, payload: ProductUpdate, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    existing = db.products.find_one({"_id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    if user["role"] == "shopkeeper" and existing["shop_id"] not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned to this shop")

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    db.products.update_one({"_id": product_id}, {"$set": data})
    return db.products.find_one({"_id": product_id})


@router.delete("/{product_id}", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def delete_product(product_id: str, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    existing = db.products.find_one({"_id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    if user["role"] == "shopkeeper" and existing["shop_id"] not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned to this shop")
    db.products.delete_one({"_id": product_id})
    return {"message": "Deleted"}


@router.post("/categories/list", dependencies=[Depends(require_roles("owner", "admin", "partner", "shopkeeper"))])
def create_category(payload: CategoryCreate):
    db = get_db()
    doc = {"_id": str(uuid.uuid4()), "name": payload.name}
    db.categories.insert_one(doc)
    return doc


@router.get("/categories/list")
def list_categories():
    db = get_db()
    return list(db.categories.find({}))
