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
    shop_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    barcode: str | None = Query(default=None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    filters = {}
    if shop_id:
        filters["shop_id"] = shop_id
    if category_id:
        filters["category_id"] = category_id
    if category:
        filters["category"] = category
    if barcode:
        filters["barcode"] = barcode
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
    wholesale_price: float = Form(0),
    buying_price: float = Form(0),
    stock: float = Form(0),
    category: str = Form(None),
    category_id: str = Form(None),
    barcode: str = Form(None),
    description: str = Form(""),
    low_stock_threshold: int = Form(5),
    unit_type: str = Form("piece"),
    conversion_factor: float = Form(1),
    image: UploadFile = File(None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    image_url = None
    if image and getattr(image, "filename", None):
        file_ext = image.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"
        upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "static", "products")
        upload_dir = os.path.abspath(upload_dir)
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(await image.read())
        image_url = f"/static/products/{filename}"

    product = {
        "_id": str(uuid.uuid4()),
        "shop_id": shop_id,
        "name": name,
        "price": float(price),
        "wholesale_price": float(wholesale_price or price),
        "buying_price": float(buying_price or 0),
        "stock": float(stock or 0),
        "category_id": category_id,
        "category": category,
        "barcode": barcode,
        "description": description,
        "low_stock_threshold": int(low_stock_threshold or 5),
        "unit_type": unit_type or "piece",
        "conversion_factor": float(conversion_factor or 1),
        "is_public": True,
        "created_at": datetime.utcnow().isoformat(),
        "created_by": user["_id"],
        "image": image_url,
    }
    db.products.insert_one(product)
    return product


# =========================
# ✏ UPDATE PRODUCT
# =========================
@router.put("/{product_id}")
async def update_product(
    product_id: str,
    shop_id: str = Form(None),
    name: str = Form(None),
    price: float = Form(None),
    wholesale_price: float = Form(None),
    buying_price: float = Form(None),
    stock: float = Form(None),
    category: str = Form(None),
    category_id: str = Form(None),
    barcode: str = Form(None),
    description: str = Form(None),
    low_stock_threshold: int = Form(None),
    unit_type: str = Form(None),
    conversion_factor: float = Form(None),
    image: UploadFile = File(None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    updates = {}
    for key, val in [
        ("shop_id", shop_id),
        ("name", name),
        ("barcode", barcode),
        ("description", description),
        ("category_id", category_id),
        ("category", category),
        ("unit_type", unit_type),
    ]:
        if val is not None:
            updates[key] = val
    for key, val in [
        ("price", price),
        ("wholesale_price", wholesale_price),
        ("buying_price", buying_price),
        ("stock", stock),
        ("conversion_factor", conversion_factor),
    ]:
        if val is not None:
            updates[key] = float(val)
    if low_stock_threshold is not None:
        updates["low_stock_threshold"] = int(low_stock_threshold)

    if image and getattr(image, "filename", None):
        file_ext = image.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"
        upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "static", "products")
        upload_dir = os.path.abspath(upload_dir)
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(await image.read())
        updates["image"] = f"/static/products/{filename}"

    if updates:
        updates["updated_at"] = datetime.utcnow().isoformat()
        db.products.update_one({"_id": product_id}, {"$set": updates})

    return db.products.find_one({"_id": product_id})


# =========================
# 🗑 DELETE PRODUCT
# =========================
@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    db.products.delete_one({"_id": product_id})
    return {"message": "Product deleted"}
