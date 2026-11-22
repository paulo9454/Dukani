from fastapi import APIRouter, Depends, HTTPException, Query
from backend.db.mongo import get_db
from backend.core.deps import require_roles, get_assigned_shop_ids, assert_shop_access
import uuid
import json
from datetime import datetime
from fastapi import UploadFile, File, Form
from starlette.concurrency import run_in_threadpool
import os


def _normalize_amount(amount, unit):
    """Convert (amount, unit) to base unit (g for mass, ml for volume)."""
    amount = float(amount or 0)
    if unit in ("kg", "litre", "l"):
        return amount * 1000.0
    return amount

router = APIRouter(prefix="/api/products", tags=["products"])

MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_PRODUCT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _upload_product_image_bytes(contents: bytes, shop_id: str) -> str:
    """Store a product image in Cloudinary and return an optimized delivery URL."""
    import cloudinary
    from cloudinary import uploader
    from cloudinary.utils import cloudinary_url

    if not os.getenv("CLOUDINARY_URL"):
        raise HTTPException(status_code=503, detail="Product image storage is not configured")

    config = cloudinary.config(secure=True)
    if not config.cloud_name:
        raise HTTPException(status_code=503, detail="Product image storage is not configured")

    try:
        result = uploader.upload(
            contents,
            folder=f"dukayko/products/{shop_id}",
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "webp"],
        )
        delivery_url, _ = cloudinary_url(
            result["public_id"],
            secure=True,
            transformation=[
                {"width": 1200, "height": 1200, "crop": "limit"},
                {"quality": "auto", "fetch_format": "auto"},
            ],
        )
        return delivery_url
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Product image upload failed. Please try again.",
        ) from exc


async def _store_product_image(image: UploadFile, shop_id: str) -> str:
    if image.content_type not in ALLOWED_PRODUCT_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Use a JPG, PNG, or WebP product image")

    contents = await image.read(MAX_PRODUCT_IMAGE_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="The selected image is empty")
    if len(contents) > MAX_PRODUCT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Product images must be 5 MB or smaller")

    return await run_in_threadpool(_upload_product_image_bytes, contents, shop_id)


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
    role = user.get("role")

    # 🔐 TENANT SCOPE — single source of truth per role.
    if role == "shopkeeper":
        assigned = get_assigned_shop_ids(user["_id"])
        if not shop_id:
            # No shop specified — list across all assigned shops only.
            if not assigned:
                return []
            shop_filter = {"$in": assigned}
        else:
            if shop_id not in assigned:
                raise HTTPException(status_code=403, detail="Not allowed for this shop")
            shop_filter = shop_id
    elif role in {"owner", "partner"}:
        owned_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
        if shop_id:
            if shop_id not in owned_ids:
                raise HTTPException(status_code=403, detail="Not your shop")
            shop_filter = shop_id
        else:
            shop_filter = {"$in": owned_ids} if owned_ids else {"$in": []}
    else:  # admin
        shop_filter = shop_id if shop_id else None

    filters = {}
    if shop_filter is not None:
        filters["shop_id"] = shop_filter
    if category_id:
        filters["category_id"] = category_id
    if category:
        filters["category"] = category
    if barcode:
        filters["barcode"] = barcode
    if q:
        filters["name"] = {"$regex": q, "$options": "i"}
    return list(db.products.find(filters).limit(500))


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
    product_type: str = Form("standard"),
    base_unit: str = Form(None),
    base_stock_quantity: float = Form(0),
    selling_units: str = Form("[]"),  # JSON-stringified list
    variants: str = Form("[]"),       # JSON-stringified list
    image: UploadFile = File(None),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    assert_shop_access(user, shop_id)

    # Parse + sanitize selling_units / variants up front so we never
    # persist garbage that would break checkout later.
    try:
        units_list = json.loads(selling_units or "[]") or []
        variants_list = json.loads(variants or "[]") or []
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid selling_units / variants JSON")

    if product_type == "unit_based":
        if base_unit not in {"g", "kg", "ml", "litre", "l"}:
            raise HTTPException(status_code=400, detail="base_unit must be g, kg, ml, or litre")
        if not units_list:
            raise HTTPException(status_code=400, detail="Add at least one selling unit")
        for u in units_list:
            if not u.get("label") or float(u.get("quantity") or 0) <= 0 or float(u.get("price") or 0) <= 0:
                raise HTTPException(status_code=400, detail="Each selling unit needs label, quantity, price")
    elif product_type == "variant":
        if not variants_list:
            raise HTTPException(status_code=400, detail="Add at least one variant")
        for v in variants_list:
            if not v.get("name"):
                raise HTTPException(status_code=400, detail="Each variant needs a name")
            v["stock"] = float(v.get("stock") or 0)
            v["price"] = float(v.get("price") or 0)
            v["buying_price"] = float(v.get("buying_price") or buying_price or 0)
            v["reserved"] = 0
    elif product_type != "standard":
        raise HTTPException(status_code=400, detail="product_type must be standard | unit_based | variant")

    image_url = None
    if image and getattr(image, "filename", None):
        image_url = await _store_product_image(image, shop_id)

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
        "product_type": product_type,
        "is_public": True,
        "created_at": datetime.utcnow().isoformat(),
        "created_by": user["_id"],
        "image": image_url,
    }

    if product_type == "unit_based":
        product["base_unit"] = base_unit
        # Always store base stock in the smallest unit (g or ml) so
        # checkout math is integer-clean.
        product["base_stock_quantity"] = float(_normalize_amount(base_stock_quantity, base_unit))
        product["reserved_base"] = 0.0
        product["selling_units"] = [
            {"label": u["label"], "quantity": float(u["quantity"]), "price": float(u["price"])}
            for u in units_list
        ]
    elif product_type == "variant":
        product["variants"] = variants_list

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
    product_type: str | None = Form(None),
    variant_label: str | None = Form(None),
    base_unit: str | None = Form(None),
    base_stock_quantity: float | None = Form(None),
    selling_units: str | None = Form(None),
    variants: str | None = Form(None),
    image: UploadFile = File(None),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    assert_shop_access(user, product.get("shop_id"))
    if shop_id is not None and shop_id != product.get("shop_id"):
        raise HTTPException(status_code=400, detail="shop_id cannot be changed here")

    updates = {}
    unset_fields = {}
    for key, val in [
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

    # Product type data is updated as one validated group. Keep reserved
    # quantities for variants whose names remain unchanged.
    if product_type is not None:
        if product_type not in {"standard", "unit_based", "variant"}:
            raise HTTPException(status_code=400, detail="product_type must be standard | unit_based | variant")

        try:
            units_list = json.loads(selling_units or "[]") if selling_units is not None else []
            variants_list = json.loads(variants or "[]") if variants is not None else []
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid selling_units / variants JSON")

        updates["product_type"] = product_type

        if product_type == "variant":
            if not variants_list:
                raise HTTPException(status_code=400, detail="Add at least one variant")
            old_by_name = {
                str(v.get("name")): v for v in (product.get("variants") or [])
            }
            cleaned = []
            seen_names = set()
            for item in variants_list:
                variant_name = str(item.get("name") or "").strip()
                if not variant_name:
                    raise HTTPException(status_code=400, detail="Each variant needs a name")
                if variant_name.lower() in seen_names:
                    raise HTTPException(status_code=400, detail=f"Duplicate variant name: {variant_name}")
                seen_names.add(variant_name.lower())
                variant_stock = float(item.get("stock") or 0)
                variant_price = float(item.get("price") or 0)
                variant_buying = float(item.get("buying_price") or buying_price or 0)
                if variant_stock < 0 or variant_price < 0 or variant_buying < 0:
                    raise HTTPException(status_code=400, detail="Variant stock and prices cannot be negative")
                old = old_by_name.get(variant_name, {})
                cleaned.append({
                    "name": variant_name,
                    "stock": variant_stock,
                    "buying_price": variant_buying,
                    "price": variant_price,
                    "reserved": float(old.get("reserved") or 0),
                })
            updates["variants"] = cleaned
            if variant_label is not None:
                updates["variant_label"] = variant_label
            unset_fields.update({
                "selling_units": "",
                "base_unit": "",
                "base_stock_quantity": "",
                "reserved_base": "",
            })
        elif product_type == "unit_based":
            if base_unit not in {"g", "kg", "ml", "litre", "l"}:
                raise HTTPException(status_code=400, detail="base_unit must be g, kg, ml, or litre")
            if not units_list:
                raise HTTPException(status_code=400, detail="Add at least one selling unit")
            cleaned_units = []
            for unit in units_list:
                label = str(unit.get("label") or "").strip()
                quantity = float(unit.get("quantity") or 0)
                unit_price = float(unit.get("price") or 0)
                if not label or quantity <= 0 or unit_price <= 0:
                    raise HTTPException(status_code=400, detail="Each selling unit needs label, quantity, price")
                cleaned_units.append({"label": label, "quantity": quantity, "price": unit_price})
            updates["base_unit"] = base_unit
            updates["base_stock_quantity"] = float(_normalize_amount(base_stock_quantity or 0, base_unit))
            updates["selling_units"] = cleaned_units
            unset_fields.update({"variants": "", "variant_label": ""})
        else:
            unset_fields.update({
                "variants": "",
                "variant_label": "",
                "selling_units": "",
                "base_unit": "",
                "base_stock_quantity": "",
                "reserved_base": "",
            })

    if image and getattr(image, "filename", None):
        updates["image"] = await _store_product_image(image, product.get("shop_id"))

    if updates or unset_fields:
        updates["updated_at"] = datetime.utcnow().isoformat()
        update_doc = {}
        if updates:
            update_doc["$set"] = updates
        if unset_fields:
            update_doc["$unset"] = unset_fields
        db.products.update_one({"_id": product_id}, update_doc)

    return db.products.find_one({"_id": product_id})


# =========================
# 🗑 DELETE PRODUCT
# =========================
@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    assert_shop_access(user, product.get("shop_id"))
    db.products.delete_one({"_id": product_id})
    return {"message": "Product deleted"}
