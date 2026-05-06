from fastapi import APIRouter, Depends, HTTPException, Header, Query
from backend.core.deps import get_current_user, require_roles, get_assigned_shop_ids
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

    # 🟢 FREE TRIAL — POS + Online for 30 days from shop creation.
    if sub.get("plan") in {"trial_pos", "trial_pos_online"}:
        trial_end = sub.get("trial_end")
        # Stored as ISO string going forward; legacy datetimes still work.
        if isinstance(trial_end, str):
            try:
                trial_end_dt = datetime.fromisoformat(trial_end.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                trial_end_dt = None
        else:
            trial_end_dt = trial_end
        if trial_end_dt and trial_end_dt > now:
            online = sub.get("plan") == "trial_pos_online"
            return {"pos": True, "online": online, "trial": True}

        raise HTTPException(
            status_code=403,
            detail="Your free trial has expired. Please subscribe to continue.",
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
        # Single source of truth: the assignments collection. The user
        # document's `assigned_shop_ids` is a denormalized cache and may
        # be stale right after an owner assigns the shopkeeper.
        assigned = get_assigned_shop_ids(user["_id"])

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
