"""Payments router — Paystack + M-Pesa scaffolds wired to Orders.

Every payment attempt persists a row in `payments` and is linked to an order_id
(when provided). On success the order moves to `paid`, on failure to `cancelled`.

To go LIVE:
  Paystack: replace the two TODO blocks with requests.post(
      "https://api.paystack.co/transaction/initialize",
      headers={"Authorization": f"Bearer {os.environ['PAYSTACK_SECRET_KEY']}"},
      json={"amount": int(amount*100), "email": email, "reference": reference,
            "callback_url": f"{public_url}/payments/paystack/return?order_id={order_id}"}
  )  and requests.get("https://api.paystack.co/transaction/verify/{reference}", ...).

  M-Pesa (Daraja):
    1) Get OAuth token from /oauth/v1/generate?grant_type=client_credentials
    2) Build STK Push payload with BusinessShortCode, Password=base64(shortcode+passkey+timestamp),
       Timestamp, TransactionType, Amount, PartyA=phone, PartyB=shortcode, PhoneNumber=phone,
       CallBackURL=os.environ['MPESA_CALLBACK_URL'], AccountReference=order_id, TransactionDesc
    3) POST to /mpesa/stkpush/v1/processrequest and keep the CheckoutRequestID.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Body
from backend.core.deps import require_roles, get_current_user_optional
from backend.db.mongo import get_db


router = APIRouter(prefix="/api/payments", tags=["payments"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_payment(doc: dict) -> dict:
    db = get_db()
    db.payments.insert_one(doc)
    return doc


def _mark_order_payment(order_id: str | None, status: str, method: str, provider: str):
    """status: pending | success | failed."""
    if not order_id:
        return
    db = get_db()
    updates = {
        "payment_status": status,
        "payment_method": method,
        "payment_provider": provider,
        "payment_updated_at": _now_iso(),
    }
    if status == "success":
        updates["status"] = "paid"
    elif status == "failed":
        updates["status"] = "cancelled"
    db.orders.update_one({"_id": order_id}, {"$set": updates})


def _get_order_or_none(order_id: str | None):
    if not order_id:
        return None
    return get_db().orders.find_one({"_id": order_id})


# =========================
# COMPARE PROVIDERS
# =========================
@router.get("/providers/compare")
def compare_providers():
    return {
        "providers": [
            {"name": "Paystack", "fee_percent": 1.5, "supports_marketplace": True, "methods": ["card", "bank"]},
            {"name": "M-Pesa", "fee_percent": 1.7, "supports_marketplace": False, "methods": ["mpesa"]},
            {"name": "Cash", "fee_percent": 0, "supports_marketplace": False, "methods": ["cash"]},
            {"name": "Credit", "fee_percent": 0, "supports_marketplace": False, "methods": ["credit"]},
        ]
    }


# =========================
# PAYSTACK
# =========================
@router.post("/paystack/initialize")
def paystack_initialize(
    payload: dict = Body(...),
    user=Depends(get_current_user_optional),
):
    amount = payload.get("amount")
    email = payload.get("email")
    order_id = payload.get("order_id")
    shop_id = payload.get("shop_id")

    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    # If order_id supplied, read amount and shop_id from the order for integrity.
    order = _get_order_or_none(order_id)
    if order:
        amount = float(order.get("total") or order.get("total_amount") or 0)
        shop_id = order.get("shop_id")
    if not amount:
        raise HTTPException(status_code=400, detail="amount or order_id is required")

    reference = f"PSK-{uuid.uuid4().hex[:14]}"
    record = {
        "_id": str(uuid.uuid4()),
        "reference": reference,
        "provider": "paystack",
        "amount": float(amount),
        "currency": payload.get("currency", "KES"),
        "shop_id": shop_id,
        "order_id": order_id,
        "user_id": user["_id"] if user else None,
        "email": email,
        "status": "pending",
        "created_at": _now_iso(),
    }
    _persist_payment(record)

    if order_id:
        _mark_order_payment(order_id, "pending", "card", "paystack")

    public_key = os.getenv("PAYSTACK_PUBLIC_KEY", "")

    # TODO (live): call Paystack /transaction/initialize and return its authorization_url.
    return {
        "status": "initialized",
        "reference": reference,
        "order_id": order_id,
        "amount": record["amount"],
        "currency": record["currency"],
        "public_key": public_key,
        "authorization_url": None,
        "provider": "paystack",
    }


@router.get("/paystack/verify")
@router.post("/paystack/verify")
def paystack_verify(
    reference: str | None = None,
    payload: dict | None = Body(default=None),
    user=Depends(get_current_user_optional),
):
    ref = reference or ((payload or {}).get("reference"))
    if not ref:
        raise HTTPException(status_code=400, detail="reference is required")

    db = get_db()
    record = db.payments.find_one({"reference": ref})

    # TODO (live): call Paystack /transaction/verify/{ref} and use its real status.
    status = "failed" if str(ref).lower().startswith("fail") else "success"

    db.payments.update_one(
        {"reference": ref},
        {"$set": {
            "status": status,
            "verified_at": _now_iso(),
            "verified_by": user["_id"] if user else None,
        }},
        upsert=True,
    )

    order_id = (record or {}).get("order_id")
    _mark_order_payment(order_id, status, "card", "paystack")

    return {
        "verified": status == "success",
        "status": status,
        "reference": ref,
        "provider": "paystack",
        "order_id": order_id,
        "amount": (record or {}).get("amount"),
    }


# =========================
# M-PESA
# =========================
@router.post("/mpesa/stk-push")
def mpesa_stk_push(
    payload: dict = Body(...),
    user=Depends(get_current_user_optional),
):
    phone = (payload.get("phone") or payload.get("phone_number") or "").strip()
    amount = payload.get("amount")
    order_id = payload.get("order_id")
    shop_id = payload.get("shop_id")

    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    order = _get_order_or_none(order_id)
    if order:
        amount = float(order.get("total") or order.get("total_amount") or 0)
        shop_id = order.get("shop_id")
    if not amount:
        raise HTTPException(status_code=400, detail="amount or order_id is required")

    checkout_request_id = f"MPESA-{uuid.uuid4().hex[:16]}"
    record = {
        "_id": str(uuid.uuid4()),
        "reference": checkout_request_id,
        "provider": "mpesa",
        "amount": float(amount),
        "currency": "KES",
        "shop_id": shop_id,
        "order_id": order_id,
        "user_id": user["_id"] if user else None,
        "phone": phone,
        "status": "pending",
        "created_at": _now_iso(),
    }
    _persist_payment(record)

    if order_id:
        _mark_order_payment(order_id, "pending", "mpesa", "mpesa")

    shortcode = os.getenv("MPESA_SHORTCODE", "")

    # TODO (live): obtain Daraja access token + POST /mpesa/stkpush/v1/processrequest
    # with AccountReference=order_id and CallBackURL=os.environ['MPESA_CALLBACK_URL'].
    return {
        "status": "initiated",
        "reference": checkout_request_id,
        "shortcode": shortcode,
        "amount": record["amount"],
        "phone": phone,
        "order_id": order_id,
        "provider": "mpesa",
        "message": "Check your phone to complete the M-Pesa payment",
    }


@router.post("/mpesa/callback")
def mpesa_callback(payload: dict = Body(...)):
    """Public Daraja callback. Parses Body.stkCallback.{ResultCode, CheckoutRequestID}."""
    db = get_db()
    body = payload.get("Body") or {}
    cb = body.get("stkCallback") or {}
    ref = cb.get("CheckoutRequestID")
    result_code = cb.get("ResultCode")
    status = "success" if result_code == 0 else "failed"

    record = None
    if ref:
        record = db.payments.find_one({"reference": ref})
        db.payments.update_one(
            {"reference": ref},
            {"$set": {
                "status": status,
                "result_code": result_code,
                "result_desc": cb.get("ResultDesc"),
                "callback_at": _now_iso(),
                "callback_payload": payload,
            }},
            upsert=True,
        )

    # Never trust frontend — the callback is the source of truth.
    order_id = (record or {}).get("order_id")
    _mark_order_payment(order_id, status, "mpesa", "mpesa")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# =========================
# LIST PAYMENTS (owner/admin)
# =========================
@router.get("/list")
def list_payments(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
        q = {"shop_id": {"$in": shop_ids}}
    else:
        q = {}
    return list(db.payments.find(q).sort("created_at", -1).limit(100))
