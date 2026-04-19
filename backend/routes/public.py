# DEPRECATED: Not mounted in server.py
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.db.mongo import get_db
from backend.core.deps import get_current_user, require_roles
from backend.services.safe_query import safe_str

router = APIRouter(prefix="/api/internal", tags=["internal"])


# =========================
# 🏪 SHOP ACCESS (POS ONLY)
# =========================
@router.get("/shops")
def list_pos_shops(
    user=Depends(get_current_user),
):
    db = get_db()

    if user["role"] == "shopkeeper":
        shop_ids = user.get("assigned_shop_ids", [])
        return list(db.shops.find({"_id": {"$in": shop_ids}}))

    # owner/admin sees all shops
    return list(db.shops.find({}))


# =========================
# 📦 POS PRODUCTS (FULL INVENTORY VIEW)
# =========================
@router.get("/products")
def list_pos_products(
    shop_id: str,
    q: str | None = Query(default=None),
    barcode: str | None = Query(default=None),
    user=Depends(get_current_user),
):
    db = get_db()

    # =========================
    # SHOP VALIDATION
    # =========================
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # =========================
    # SHOPKEEPER LOCK
    # =========================
    if user["role"] == "shopkeeper":
        if shop_id not in user.get("assigned_shop_ids", []):
            raise HTTPException(status_code=403, detail="Not allowed for this shop")

    # =========================
    # BUILD FILTER
    # =========================
    filters = {"shop_id": shop_id}

    if barcode:
        filters["barcode"] = safe_str(barcode, "barcode")

    if q:
        q = safe_str(q, "q")
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    # =========================
    # POS RETURNS EVERYTHING IN STOCK SYSTEM
    # (NO online/is_public FILTERS HERE)
    # =========================
    return list(db.products.find(filters))


# =========================
# 🔍 SINGLE PRODUCT LOOKUP (POS SCAN)
# =========================
@router.get("/products/{product_id}")
def get_product(product_id: str, shop_id: str):
    db = get_db()

    product = db.products.find_one({
        "_id": product_id,
        "shop_id": shop_id
    })

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product
