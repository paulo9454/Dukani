# DEPRECATED: Not mounted in server.py
from fastapi import APIRouter, Depends, Header
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.schemas.order import POSCheckoutRequest
from backend.services.checkout import checkout_pos
from backend.services.audit import audit_log
import uuid

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("")
def list_orders(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper", "customer"))):
    db = get_db()
    if user["role"] == "customer":
        return list(db.orders.find({"customer_id": user["_id"]}))
    if user["role"] == "shopkeeper":
        return list(db.orders.find({"shop_id": {"$in": user.get("assigned_shop_ids", [])}}))
    return list(db.orders.find({}))


@router.post("/checkout")
def pos_checkout(
    payload: POSCheckoutRequest,
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    idempotency_key = idempotency_key_header or payload.idempotency_key or str(uuid.uuid4())
    result = checkout_pos(
        user,
        payload.shop_id,
        [i.model_dump() for i in payload.items],
        payload.payment_provider,
        idempotency_key,
        payload.payment_method,
        payload.discount,
        payload.tax_percent,
        payload.payment_meta,
    )
    audit_log("pos_checkout_request", actor_id=user["_id"], metadata={"idempotency_key": idempotency_key, "shop_id": payload.shop_id})
    return result
