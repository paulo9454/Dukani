from fastapi import APIRouter, Depends
from backend.core.deps import require_roles, get_assigned_shop_ids
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/credit-payments/history", tags=["credit"])


@router.get("")
def credit_history(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.credit_payments_history.find({"shop_id": {"$in": get_assigned_shop_ids(user["_id"])}}))
    return list(db.credit_payments_history.find({}))
