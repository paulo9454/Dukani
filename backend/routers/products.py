from fastapi import APIRouter, Depends, HTTPException, Query
from backend.db.mongo import get_db
from backend.core.deps import require_roles
import uuid
from datetime import datetime
from fastapi import UploadFile, File, Form
import os

router = APIRouter(prefix="/api/products", tags=["products"])


# =========================
# 📦 LIST PRODUCTS
# =========================
@router.get("")
def list_products(
    shop_id: str,
    q: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    filters = {"shop_id": shop_id}

    if category_id:
        filters["category_id"] = category_id

    if q:
        filters["name"] = {"$regex": q, "$options": "i"}

    return list(db.products.find(filters))


# =========================
# ➕ CREATE PRODUCT
# =========================
@router.post("")
async def create_product(
    shop_id: str = Form(...),
    name: str = Form(...),
    price: float = Form(0),
    stock: int = Form(0),
    category_id: str = Form(None),
    barcode: str = Form(None),
    description: str = Form(""),
    low_stock_threshold: int = Form(5),

    image: UploadFile = File(None),  # 👈 NEW

    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    # =========================
    # 🖼 HANDLE IMAGE
    # =========================
    image_url = None

    if image:
        file_ext = image.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"

        upload_dir = "static/products"
        os.makedirs(upload_dir, exist_ok=True)

        file_path = f"{upload_dir}/{filename}"

        with open(file_path, "wb") as f:
            f.write(await image.read())

        image_url = f"/static/products/{filename}"

    # =========================
    # 📦 PRODUCT OBJECT
    # =========================
    product = {
    "_id": str(uuid.uuid4()),
    "shop_id": shop_id,
    "name": name,

    # 💰 PRICES (ADD THESE)
    "price": float(price),
    "wholesale_price": float(price),  # 👈 temporary fallback
    "buying_price": 0,                # 👈 default (until restock)

    # 📦 STOCK
    "stock": int(stock),
    "category_id": category_id,

    "barcode": barcode,
    "description": description,
    "low_stock_threshold": low_stock_threshold,

    "created_at": datetime.utcnow(),
    "created_by": user["_id"],

    # 🖼 IMAGE
    "image": image_url,
}
    db.products.insert_one(product)
    return product
