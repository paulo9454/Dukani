from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles, get_assigned_shop_ids
from backend.db.mongo import get_db
from datetime import datetime, timezone
import uuid
from backend.services.audit import audit_log

router = APIRouter(prefix="/api/credit-customers", tags=["credit"])


@router.get("")
def list_credit_customers(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.credit_customers.find({"shop_id": {"$in": get_assigned_shop_ids(user["_id"])}}))
    return list(db.credit_customers.find({}))
@router.post("")
def create_credit_customer(payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()

    name = payload.get("name")
    phone = payload.get("phone")
    credit_limit = float(payload.get("credit_limit", 0))
    shop_id = payload.get("shop_id")

    # ✅ VALIDATION FIRST
    if not name or not phone or not shop_id:
        raise HTTPException(status_code=400, detail="name, phone, shop_id required")

    # 🛑 SECURITY FIX: shopkeeper must only use assigned shops
    if user["role"] == "shopkeeper":
        assigned = get_assigned_shop_ids(user["_id"])
        if shop_id not in assigned:
            raise HTTPException(status_code=403, detail="Not allowed for this shop")

    customer = {
        "_id": str(uuid.uuid4()),
        "name": name,
        "phone": phone,
        "shop_id": shop_id,
        "credit_limit": credit_limit,
        "balance": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    db.credit_customers.insert_one(customer)

    audit_log(
        "credit_customer_created",
        actor_id=user["_id"],
        metadata=customer
    )

    return customer
@router.post("/{ledger_id}/payment")
def record_credit_payment(ledger_id: str, payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    ledger = db.credit_customers.find_one({"_id": ledger_id})
    if not ledger:
        raise HTTPException(status_code=404, detail="Credit ledger not found")
    if user["role"] == "shopkeeper" and ledger["shop_id"] not in get_assigned_shop_ids(user["_id"]):
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
            "customer_id": ledger.get("customer_id"),
            "shop_id": ledger["shop_id"],
            "amount": amount,
            "method": payload.get("method") or "cash",
            "type": "credit_payment",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    audit_log("credit_payment", actor_id=user["_id"], metadata={"ledger_id": ledger_id, "amount": amount})
    return {"ledger_id": ledger_id, "balance": new_balance}


# =========================================================
# 📲 CREDIT — STK PUSH (Lipa via M-Pesa)
# Sends a Daraja STK request to the customer for the amount
# they owe (or a partial). On success the existing M-Pesa
# callback handler will reduce the credit balance via the
# `credit_ledger_id` metadata stored on the payment record.
# =========================================================
@router.post("/{ledger_id}/payment-stk")
def credit_payment_stk(
    ledger_id: str,
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    ledger = db.credit_customers.find_one({"_id": ledger_id})
    if not ledger:
        raise HTTPException(status_code=404, detail="Credit ledger not found")
    if user["role"] == "shopkeeper" and ledger["shop_id"] not in get_assigned_shop_ids(user["_id"]):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned")

    amount = float(payload.get("amount") or ledger.get("balance") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to charge")

    phone = (payload.get("phone") or ledger.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone required")

    # Defer to the payments router so we reuse the verified Daraja flow.
    from backend.routers.payments import _stk_push, _mpesa_cfg, _persist_payment, _now_iso
    shop = db.shops.find_one({"_id": ledger["shop_id"]})
    cfg = _mpesa_cfg(shop)

    checkout_request_id, daraja_response = _stk_push(cfg, None, amount, phone)

    record = {
        "_id": str(uuid.uuid4()),
        "reference": checkout_request_id,
        "provider": "mpesa",
        "amount": float(amount),
        "currency": "KES",
        "shop_id": ledger["shop_id"],
        "credit_ledger_id": ledger_id,        # 🔑 link back to the ledger
        "payment_type": "credit_settlement",
        "phone": phone,
        "status": "pending",
        "created_at": _now_iso(),
        "daraja_response": daraja_response,
    }
    _persist_payment(record)
    audit_log(
        "credit_stk_initiated",
        actor_id=user["_id"],
        metadata={"ledger_id": ledger_id, "amount": amount, "reference": checkout_request_id},
    )
    return {
        "reference": checkout_request_id,
        "status": "pending",
        "amount": amount,
        "phone": phone,
    }


# =========================================================
# 📜 OWNER/SHOPKEEPER — CREDIT PAYMENT HISTORY FOR A LEDGER
# =========================================================
@router.get("/{ledger_id}/history")
def credit_payment_history(
    ledger_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    ledger = db.credit_customers.find_one({"_id": ledger_id})
    if not ledger:
        raise HTTPException(status_code=404, detail="Credit ledger not found")
    if user["role"] == "shopkeeper" and ledger["shop_id"] not in get_assigned_shop_ids(user["_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = list(
        db.credit_payments_history.find(
            {"ledger_id": ledger_id},
            {"_id": 1, "amount": 1, "type": 1, "created_at": 1, "method": 1},
        ).sort("created_at", -1).limit(50)
    )
    return rows
