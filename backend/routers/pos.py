from fastapi import APIRouter, Depends, HTTPException, Header, Query
from backend.core.deps import get_current_user, require_roles
from backend.db.mongo import get_db
from backend.schemas.order import POSCheckoutRequest
from backend.services.checkout import checkout_pos
from backend.services.safe_query import safe_str
import uuid
from datetime import datetime

router = APIRouter()


# =========================
# 🔥 SUBSCRIPTION CHECK
# =========================
def check_shop_access(shop_id: str):
    db = get_db()

    sub = db.subscriptions.find_one({"shop_id": shop_id})
    if not sub:
        raise HTTPException(status_code=403, detail="No subscription")

    now = datetime.utcnow()

    # 🟢 FREE TRIAL (POS ONLY)
    if sub.get("plan") == "trial_pos":
        if sub.get("trial_end") and sub["trial_end"] > now:
            return {"pos": True, "online": False}

        raise HTTPException(
            status_code=403,
            detail="Trial expired. Please pay for POS or POS + Online",
        )

    # 💳 PAID PLANS
    if sub.get("is_paid"):
        if sub.get("plan") == "pos":
            return {"pos": True, "online": False}

        if sub.get("plan") == "pos_online":
            return {"pos": True, "online": True}

    raise HTTPException(status_code=403, detail="Subscription inactive")


# =========================
# 🔒 SHOP RESOLUTION
# =========================
def resolve_shop(user: dict, shop_id: str | None):
    role = user.get("role")

    if role == "shopkeeper":
        assigned = user.get("assigned_shop_ids", [])

        if not assigned:
            raise HTTPException(status_code=403, detail="No shop assigned")

        if shop_id and shop_id not in assigned:
            raise HTTPException(status_code=403, detail="Not allowed")

        return shop_id or assigned[0]

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")

    return shop_id


# =========================
# 🔥 LOAD SHOP
# =========================
def get_shop_or_404(db, shop_id: str):
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop

# =========================
# 💳 POS CHECKOUT
# =========================
@router.post("/api/orders/checkout")
def pos_checkout(
    payload: POSCheckoutRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    key = idempotency_key or payload.idempotency_key
    if not key:
        raise HTTPException(status_code=400, detail="Idempotency key required")

    shop_id = resolve_shop(user, payload.shop_id)
    get_shop_or_404(db, shop_id)

    access = check_shop_access(shop_id)
    if not access["pos"]:
        raise HTTPException(status_code=403, detail="POS not allowed")

    return checkout_pos(
        operator=user,
        shop_id=shop_id,
        items=[i.model_dump() for i in payload.items],
        payment_provider=payload.payment_provider,
        idempotency_key=key,
        payment_method=payload.payment_method,
        discount=payload.discount,
        tax_percent=payload.tax_percent,
        payment_meta=payload.payment_meta,
    )
