from fastapi import APIRouter, Depends, HTTPException, Header, Query
from backend.core.deps import get_current_user, require_roles
from backend.db.mongo import get_db
from backend.schemas.order import POSCheckoutRequest
from backend.services.checkout import checkout_pos
from backend.services.audit import audit_log
from backend.services.safe_query import safe_str
import uuid

router = APIRouter()


# =========================
# SHOP RESOLUTION (POS SAFE)
# =========================
def resolve_shop(user: dict, shop_id: str | None):
    role = user.get("role")

    if role == "shopkeeper":
        assigned = user.get("assigned_shop_ids", [])

        if not assigned:
            raise HTTPException(status_code=403, detail="No shop assigned")

        if shop_id and shop_id not in assigned:
            raise HTTPException(status_code=403, detail="Not allowed for this shop")

        return shop_id or assigned[0]

    # owner/admin must explicitly select shop
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required for POS")

    return shop_id


# =========================
# POS PRODUCTS (INVENTORY ONLY)
# =========================
@router.get("/api/products")
def list_products(
    shop_id: str,
    q: str | None = Query(default=None),
    barcode: str | None = Query(default=None),
    user=Depends(get_current_user),
):
    if user["role"] == "customer":
        raise HTTPException(status_code=403, detail="Customers use public API")

    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # shopkeeper lock
    if user["role"] == "shopkeeper":
        if shop_id not in user.get("assigned_shop_ids", []):
            raise HTTPException(status_code=403, detail="Not allowed for this shop")

    filters = {"shop_id": shop_id}

    if barcode:
        filters["barcode"] = safe_str(barcode, "barcode")

    if q:
        q = safe_str(q, "q")
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    # POS ALWAYS SHOWS ALL INVENTORY (NO is_online / marketplace filters)
    return list(db.products.find(filters))


# =========================
# CREATE PRODUCT (POS SAFE)
# =========================
@router.post("/api/products")
def create_product(
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop_id = payload.get("shop_id")
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    shop_id = resolve_shop(user, shop_id)

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    payload["_id"] = str(uuid.uuid4())
    payload["shop_id"] = shop_id

    # default POS-safe fields
    payload.setdefault("is_public", False)
    payload.setdefault("is_online", False)

    db.products.insert_one(payload)
    return payload


# =========================
# POS CHECKOUT (CORE ENGINE)
# =========================
@router.post("/api/orders/checkout")
def pos_checkout(
    payload: POSCheckoutRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    key = idempotency_key or payload.idempotency_key

    if not key:
        raise HTTPException(status_code=400, detail="Idempotency key required")

    shop_id = resolve_shop(user, payload.shop_id)

    audit_log(
        "pos_checkout_request",
        actor_id=user["_id"],
        metadata={
            "shop_id": shop_id,
            "items": len(payload.items),
        },
    )

    return checkout_pos(
        user,
        shop_id,
        [i.model_dump() for i in payload.items],
        payload.payment_provider,
        key,
        payload.payment_method,
        payload.discount,
        payload.tax_percent,
        payload.payment_meta,
    )


# DEPRECATED: customer checkout endpoint removed from POS router.
