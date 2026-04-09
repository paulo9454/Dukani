from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from datetime import datetime, timezone
import uuid
from backend.services.audit import audit_log

router = APIRouter(prefix="/api/credit-customers", tags=["credit"])


@router.get("")
def list_credit_customers(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.credit_customers.find({"shop_id": {"$in": user.get("assigned_shop_ids", [])}}))
    return list(db.credit_customers.find({}))


@router.post("/{ledger_id}/payment")
def record_credit_payment(ledger_id: str, payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    ledger = db.credit_customers.find_one({"_id": ledger_id})
    if not ledger:
        raise HTTPException(status_code=404, detail="Credit ledger not found")
    if user["role"] == "shopkeeper" and ledger["shop_id"] not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned")

    amount = float(payload.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    new_balance = max(round(ledger.get("balance", 0) - amount, 2), 0)
    db.credit_customers.update_one({"_id": ledger_id}, {"$set": {"balance": new_balance}})
    db.credit_payments_history.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "ledger_id": ledger_id,
            "customer_id": ledger["customer_id"],
            "shop_id": ledger["shop_id"],
            "amount": amount,
            "type": "credit_payment",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    audit_log("credit_payment", actor_id=user["_id"], metadata={"ledger_id": ledger_id, "amount": amount})
    return {"ledger_id": ledger_id, "balance": new_balance}
