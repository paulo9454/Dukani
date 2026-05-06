"""Credits API — debt ledger with manual import + atomic repayment.

Operates on the existing `credit_customers` MongoDB collection (each row
represents ONE outstanding debt) and writes payment events into
`credit_payments_history`. The spec calls these "credits" and
"credit_transactions" — we keep the existing collection names to avoid
data migration but expose them under the new public namespace.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from datetime import datetime, timezone
from typing import Literal
import uuid

from backend.core.deps import require_roles, get_assigned_shop_ids
from backend.db.mongo import get_db
from backend.services.audit import audit_log

router = APIRouter(prefix="/api/credits", tags=["credits"])


# =========================================================
# Helpers
# =========================================================
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize(doc: dict) -> dict:
    """Drop Mongo-only fields and project to the public credit shape."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if not k.startswith("_") or k == "_id"}
    # Backfill spec fields when reading legacy POS-created rows that only
    # have `balance` and `name`.
    out.setdefault("customer_name", doc.get("name"))
    out.setdefault("total_amount", doc.get("total_amount", doc.get("balance", 0)))
    out.setdefault("amount_paid", doc.get("amount_paid", 0))
    out.setdefault("balance", doc.get("balance", 0))
    out.setdefault("status", doc.get("status") or ("paid" if (doc.get("balance") or 0) <= 0 else "open"))
    out.setdefault("source", doc.get("source", "sale"))
    return out


def _scope_shop(user: dict, shop_id: str) -> str:
    if user["role"] == "shopkeeper":
        if shop_id not in get_assigned_shop_ids(user["_id"]):
            raise HTTPException(status_code=403, detail="Not allowed for this shop")
    elif user["role"] in {"owner", "partner"}:
        db = get_db()
        if not db.shops.find_one({"_id": shop_id, "owner_id": user["_id"]}, {"_id": 1}):
            raise HTTPException(status_code=403, detail="Not your shop")
    return shop_id


def _load_credit_for(user: dict, credit_id: str) -> dict:
    db = get_db()
    credit = db.credit_customers.find_one({"_id": credit_id})
    if not credit:
        raise HTTPException(status_code=404, detail="Credit not found")
    if user["role"] == "shopkeeper" and credit.get("shop_id") not in get_assigned_shop_ids(user["_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    if user["role"] in {"owner", "partner"}:
        if not db.shops.find_one({"_id": credit.get("shop_id"), "owner_id": user["_id"]}, {"_id": 1}):
            raise HTTPException(status_code=403, detail="Not your shop")
    return credit


# =========================================================
# 📋 LIST CREDITS
# =========================================================
@router.get("")
def list_credits(
    shop_id: str | None = None,
    status: Literal["open", "paid", "all"] = "all",
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()
    role = user["role"]

    if role == "shopkeeper":
        ids = get_assigned_shop_ids(user["_id"])
        if shop_id and shop_id not in ids:
            raise HTTPException(status_code=403, detail="Not allowed for this shop")
        scope = {"shop_id": shop_id} if shop_id else {"shop_id": {"$in": ids}}
    elif role in {"owner", "partner"}:
        owned = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
        if shop_id and shop_id not in owned:
            raise HTTPException(status_code=403, detail="Not your shop")
        scope = {"shop_id": shop_id} if shop_id else {"shop_id": {"$in": owned}}
    else:
        scope = {"shop_id": shop_id} if shop_id else {}

    if status != "all":
        scope["status"] = status

    rows = list(db.credit_customers.find(scope).sort("updated_at", -1).limit(500))
    return [_serialize(r) for r in rows]


# =========================================================
# ✍️ MANUAL CREATE (existing debts from physical books)
# =========================================================
@router.post("/manual-create")
def manual_create(
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    name = (payload.get("customer_name") or payload.get("name") or "").strip()
    phone = (payload.get("phone") or "").strip() or None
    shop_id = payload.get("shop_id")
    notes = (payload.get("notes") or "").strip() or None

    try:
        total = float(payload.get("total_amount") or 0)
        paid = float(payload.get("amount_paid") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="total_amount and amount_paid must be numbers")

    if not name or not shop_id:
        raise HTTPException(status_code=400, detail="customer_name and shop_id are required")
    if total <= 0:
        raise HTTPException(status_code=400, detail="total_amount must be greater than 0")
    if paid < 0:
        raise HTTPException(status_code=400, detail="amount_paid cannot be negative")
    if paid > total:
        raise HTTPException(status_code=400, detail="amount_paid cannot exceed total_amount")

    _scope_shop(user, shop_id)

    db = get_db()
    balance = round(total - paid, 2)
    status = "paid" if balance <= 0 else "open"
    now = _now()
    credit_id = str(uuid.uuid4())

    doc = {
        "_id": credit_id,
        "shop_id": shop_id,
        "customer_name": name,
        "name": name,                  # back-compat with /api/credit-customers
        "phone": phone,
        "total_amount": total,
        "amount_paid": paid,
        "balance": balance,
        "status": status,
        "source": "manual_import",
        "notes": notes,
        "created_at": now,
        "updated_at": now,
        "credit_limit": total,         # legacy advisory field
    }
    db.credit_customers.insert_one(doc)

    if paid > 0:
        db.credit_payments_history.insert_one({
            "_id": str(uuid.uuid4()),
            "credit_id": credit_id,
            "ledger_id": credit_id,    # back-compat key
            "shop_id": shop_id,
            "amount": paid,
            "method": "manual",
            "type": "credit_initial",
            "created_at": now,
        })

    audit_log(
        "credit_manual_import",
        actor_id=user["_id"],
        metadata={"credit_id": credit_id, "total": total, "paid": paid, "shop_id": shop_id},
    )

    return _serialize(doc)


# =========================================================
# 💰 REPAYMENT (atomic, idempotent)
# =========================================================
@router.post("/{credit_id}/repay")
def repay(
    credit_id: str,
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    method = payload.get("method") or "cash"
    if method not in {"mpesa", "cash", "manual"}:
        raise HTTPException(status_code=400, detail="method must be one of mpesa | cash | manual")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")
    reference = (payload.get("reference") or "").strip() or None

    _load_credit_for(user, credit_id)
    db = get_db()

    # 🔒 Atomic conditional update — only succeeds if a fresh balance >= amount.
    # Computes new state in a single Mongo command to defeat the classic
    # read-then-write race that would otherwise let two concurrent payments
    # overdraft a credit.
    result = db.credit_customers.find_one_and_update(
        {
            "_id": credit_id,
            "$expr": {
                "$gte": [
                    {"$subtract": [
                        {"$ifNull": ["$total_amount", {"$ifNull": ["$balance", 0]}]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                    amount,
                ]
            },
        },
        [
            {"$set": {
                "amount_paid": {"$add": [{"$ifNull": ["$amount_paid", 0]}, amount]},
                "balance": {"$max": [
                    {"$subtract": [
                        {"$ifNull": ["$total_amount", {"$ifNull": ["$balance", 0]}]},
                        {"$add": [{"$ifNull": ["$amount_paid", 0]}, amount]},
                    ]},
                    0,
                ]},
                "status": {"$cond": [
                    {"$lte": [
                        {"$subtract": [
                            {"$ifNull": ["$total_amount", {"$ifNull": ["$balance", 0]}]},
                            {"$add": [{"$ifNull": ["$amount_paid", 0]}, amount]},
                        ]},
                        0,
                    ]},
                    "paid",
                    "open",
                ]},
                "updated_at": _now(),
            }},
        ],
        return_document=True,
    )

    if not result:
        # Either the credit vanished or the amount exceeds the remaining balance.
        current = db.credit_customers.find_one({"_id": credit_id})
        if not current:
            raise HTTPException(status_code=404, detail="Credit not found")
        raise HTTPException(
            status_code=400,
            detail="Amount exceeds the outstanding balance",
        )

    db.credit_payments_history.insert_one({
        "_id": str(uuid.uuid4()),
        "credit_id": credit_id,
        "ledger_id": credit_id,
        "shop_id": result.get("shop_id"),
        "amount": amount,
        "method": method,
        "reference": reference,
        "type": "credit_payment",
        "created_at": _now(),
    })

    audit_log(
        "credit_repaid",
        actor_id=user["_id"],
        metadata={"credit_id": credit_id, "amount": amount, "method": method},
    )

    return _serialize(result)


# =========================================================
# 📜 TRANSACTION HISTORY
# =========================================================
@router.get("/{credit_id}/transactions")
def transactions(
    credit_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    _load_credit_for(user, credit_id)
    db = get_db()
    rows = list(
        db.credit_payments_history.find(
            {"$or": [{"credit_id": credit_id}, {"ledger_id": credit_id}]},
            {"_id": 1, "amount": 1, "method": 1, "reference": 1, "type": 1, "created_at": 1},
        ).sort("created_at", -1).limit(100)
    )
    return rows


# =========================================================
# 📲 STK PUSH FOR REPAYMENT — Daraja initiates, callback finalises.
# =========================================================
@router.post("/{credit_id}/repay-stk")
def repay_stk(
    credit_id: str,
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    credit = _load_credit_for(user, credit_id)
    try:
        amount = float(payload.get("amount") or credit.get("balance") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to charge")
    if amount > float(credit.get("balance") or 0):
        raise HTTPException(status_code=400, detail="Amount exceeds outstanding balance")
    phone = (payload.get("phone") or credit.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone required")

    from backend.routers.payments import _stk_push, _mpesa_cfg, _persist_payment, _now_iso

    db = get_db()
    shop = db.shops.find_one({"_id": credit.get("shop_id")})
    cfg = _mpesa_cfg(shop)
    checkout_request_id, daraja_response = _stk_push(cfg, None, amount, phone)

    record = {
        "_id": str(uuid.uuid4()),
        "reference": checkout_request_id,
        "provider": "mpesa",
        "amount": float(amount),
        "currency": "KES",
        "shop_id": credit.get("shop_id"),
        "credit_id": credit_id,
        "credit_ledger_id": credit_id,           # back-compat alias
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
        metadata={"credit_id": credit_id, "amount": amount, "reference": checkout_request_id},
    )
    return {
        "reference": checkout_request_id,
        "status": "pending",
        "amount": amount,
        "phone": phone,
    }
