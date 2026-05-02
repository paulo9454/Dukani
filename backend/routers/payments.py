"""Payments router — Paystack + M-Pesa scaffolds.

Real provider calls are NOT made yet. Each handler:
  • Validates input
  • Persists a Payment record in `payments` collection
  • Returns the same shape the real integration will return

To go live:
  - Paystack: implement the two TODO blocks (initialize and verify) using
    POST https://api.paystack.co/transaction/initialize
    GET  https://api.paystack.co/transaction/verify/{reference}
    with `Authorization: Bearer {PAYSTACK_SECRET_KEY}`.
  - M-Pesa Daraja: implement TODO blocks for STK push using the Daraja
    sandbox/production endpoints with MPESA_CONSUMER_KEY/SECRET, MPESA_SHORTCODE,
    MPESA_PASSKEY and webhook callback URL.

Required env vars (read from os.environ):
  PAYSTACK_PUBLIC_KEY, PAYSTACK_SECRET_KEY
  MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY,
  MPESA_CALLBACK_URL
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Body
from backend.core.deps import require_roles
from backend.db.mongo import get_db


router = APIRouter(prefix="/api/payments", tags=["payments"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_payment(doc: dict) -> dict:
    db = get_db()
    db.payments.insert_one(doc)
    return doc


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
    user=Depends(require_roles("owner", "admin", "partner", "customer")),
):
    amount = payload.get("amount")
    email = payload.get("email")
    shop_id = payload.get("shop_id")
    order_id = payload.get("order_id")
    if not amount or not email:
        raise HTTPException(status_code=400, detail="amount and email are required")

    reference = f"PSK-{uuid.uuid4().hex[:14]}"
    record = {
        "_id": str(uuid.uuid4()),
        "reference": reference,
        "provider": "paystack",
        "amount": float(amount),
        "currency": payload.get("currency", "KES"),
        "shop_id": shop_id,
        "order_id": order_id,
        "user_id": user["_id"],
        "email": email,
        "status": "pending",
        "created_at": _now_iso(),
    }
    _persist_payment(record)

    public_key = os.getenv("PAYSTACK_PUBLIC_KEY", "")
    # TODO (live): call Paystack /transaction/initialize and replace authorization_url below.
    return {
        "status": "initialized",
        "reference": reference,
        "amount": record["amount"],
        "currency": record["currency"],
        "public_key": public_key,
        "authorization_url": None,  # filled by real Paystack call
        "provider": "paystack",
    }


@router.get("/paystack/verify")
@router.post("/paystack/verify")
def paystack_verify(
    reference: str | None = None,
    payload: dict | None = Body(default=None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper", "customer")),
):
    ref = reference or ((payload or {}).get("reference"))
    if not ref:
        raise HTTPException(status_code=400, detail="reference is required")

    db = get_db()
    record = db.payments.find_one({"reference": ref})
    # TODO (live): call Paystack /transaction/verify/{ref} and use real status.
    status = "failed" if str(ref).lower().startswith("fail") else "success"
    db.payments.update_one(
        {"reference": ref},
        {"$set": {"status": status, "verified_at": _now_iso(), "verified_by": user["_id"]}},
        upsert=True,
    )
    return {
        "verified": status == "success",
        "status": status,
        "reference": ref,
        "provider": "paystack",
        "amount": (record or {}).get("amount"),
    }


# =========================
# M-PESA
# =========================
@router.post("/mpesa/stk-push")
def mpesa_stk_push(
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper", "customer")),
):
    phone = (payload.get("phone") or "").strip()
    amount = payload.get("amount")
    shop_id = payload.get("shop_id")
    order_id = payload.get("order_id")
    if not phone or not amount:
        raise HTTPException(status_code=400, detail="phone and amount are required")

    checkout_request_id = f"MPESA-{uuid.uuid4().hex[:16]}"
    record = {
        "_id": str(uuid.uuid4()),
        "reference": checkout_request_id,
        "provider": "mpesa",
        "amount": float(amount),
        "currency": "KES",
        "shop_id": shop_id,
        "order_id": order_id,
        "user_id": user["_id"],
        "phone": phone,
        "status": "pending",
        "created_at": _now_iso(),
    }
    _persist_payment(record)

    shortcode = os.getenv("MPESA_SHORTCODE", "")
    # TODO (live): obtain Daraja access token, build STK Push payload, POST to
    # /mpesa/stkpush/v1/processrequest, capture CheckoutRequestID, return it.
    return {
        "status": "initiated",
        "reference": checkout_request_id,
        "shortcode": shortcode,
        "amount": record["amount"],
        "phone": phone,
        "provider": "mpesa",
    }


@router.post("/mpesa/callback")
def mpesa_callback(payload: dict = Body(...)):
    """Public Daraja callback. Daraja posts a JSON body with Body.stkCallback.{
        ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata...}"""
    db = get_db()
    body = payload.get("Body") or {}
    cb = body.get("stkCallback") or {}
    ref = cb.get("CheckoutRequestID")
    result_code = cb.get("ResultCode")
    status = "success" if result_code == 0 else "failed"

    if ref:
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
    # Daraja expects a 200 with this shape:
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
