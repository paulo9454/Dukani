"""Payments router — Paystack + M-Pesa with live HTTP integration.

Behavior:
  • Persist a `payments` row for every attempt (id, order_id, shop_id, amount,
    currency, status, provider, reference).
  • Mark the linked order: payment_status (pending/success/failed) and order
    status (paid/cancelled). Restore stock on failure.
  • Idempotent callbacks — re-processing the same Paystack webhook or Daraja
    callback is a no-op.

Live integration:
  • Paystack: real /transaction/initialize and /transaction/verify when
    PAYSTACK_SECRET_KEY is present. Webhook signature is verified with
    HMAC-SHA512 against the secret.
  • M-Pesa: real OAuth + STK Push when MPESA_* env vars are present.
  • If env vars are missing, we fall back to a sandbox-safe stub so dev/preview
    flows keep working.
"""
from __future__ import annotations

import os
import uuid
import base64
import hmac
import hashlib
import logging
import json
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Body, Request, Header
from backend.core.deps import require_roles, get_current_user_optional
from backend.db.mongo import get_db
from backend.services.inventory import restore_order_stock, commit_order_reservation
from backend.services.analytics import (
    already_paid as _already_paid,
    track_event as _track,
    log_error as _log_error,
)


logger = logging.getLogger("payments")
router = APIRouter(prefix="/api/payments", tags=["payments"])


# ─────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _persist_payment(doc: dict) -> dict:
    get_db().payments.insert_one(doc)
    return doc


def _get_order_or_none(order_id: str | None):
    if not order_id:
        return None
    return get_db().orders.find_one({"_id": order_id})


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

    # Side effects
    if status == "success":
        commit_order_reservation(order_id)
    elif status == "failed":
        restore_order_stock(order_id)


def _idempotent_settle(reference: str, status: str) -> tuple[bool, dict | None]:
    """Returns (already_processed, existing_record).

    A payment whose status is already success/failed is locked — we must NOT
    flip it again, otherwise duplicate webhooks could break the order state.
    """
    db = get_db()
    record = db.payments.find_one({"reference": reference})
    if record and record.get("status") in {"success", "failed"} and record.get("status") == status:
        return True, record
    if record and record.get("status") in {"success", "failed"}:
        # Status conflict (e.g. webhook says failed after success) — log and ignore.
        logger.warning("payment %s already settled as %s, ignoring %s", reference, record.get("status"), status)
        return True, record
    return False, record


# ─────────────────────────────────────────────────────────────────
# COMPARE PROVIDERS
# ─────────────────────────────────────────────────────────────────
@router.get("/providers/compare")
def compare_providers():
    return {
        "providers": [
            {"name": "Paystack", "fee_percent": 1.5, "supports_marketplace": True, "methods": ["card", "bank"]},
            {"name": "M-Pesa", "fee_percent": 1.7, "supports_marketplace": False, "methods": ["mpesa"]},
            {"name": "Cash", "fee_percent": 0, "supports_marketplace": False, "methods": ["cash"]},
        ]
    }


# ─────────────────────────────────────────────────────────────────
# PAYSTACK
# ─────────────────────────────────────────────────────────────────
def _paystack_live() -> bool:
    return bool(os.getenv("PAYSTACK_SECRET_KEY"))


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
    if _already_paid(order_id):
        raise HTTPException(status_code=409, detail="This order is already paid.")
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
    authorization_url = None

    if _paystack_live():
        try:
            resp = httpx.post(
                "https://api.paystack.co/transaction/initialize",
                headers={
                    "Authorization": f"Bearer {os.environ['PAYSTACK_SECRET_KEY']}",
                    "Content-Type": "application/json",
                },
                json={
                    "amount": int(round(float(amount) * 100)),
                    "email": email,
                    "currency": record["currency"],
                    "reference": reference,
                    "metadata": {"order_id": order_id, "shop_id": shop_id},
                },
                timeout=15,
            )
            data = resp.json()
            if resp.status_code >= 400 or not data.get("status"):
                logger.error("paystack init failed: %s", data)
            authorization_url = (data.get("data") or {}).get("authorization_url")
        except Exception as exc:
            logger.exception("paystack init exception: %s", exc)

    return {
        "status": "initialized",
        "reference": reference,
        "order_id": order_id,
        "amount": record["amount"],
        "currency": record["currency"],
        "public_key": public_key,
        "authorization_url": authorization_url,
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
    if record and record.get("status") in {"success", "failed"}:
        # Idempotent — return the recorded status
        return {
            "verified": record["status"] == "success",
            "status": record["status"],
            "reference": ref,
            "provider": "paystack",
            "order_id": record.get("order_id"),
            "amount": record.get("amount"),
            "idempotent": True,
        }

    status = "success"
    if _paystack_live():
        try:
            resp = httpx.get(
                f"https://api.paystack.co/transaction/verify/{ref}",
                headers={"Authorization": f"Bearer {os.environ['PAYSTACK_SECRET_KEY']}"},
                timeout=15,
            )
            data = resp.json()
            paystack_status = (data.get("data") or {}).get("status")
            status = "success" if paystack_status == "success" else "failed"
        except Exception as exc:
            logger.exception("paystack verify exception: %s", exc)
            status = "failed"
    else:
        # Dev fallback — references starting with FAIL/fail simulate failure.
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
    _mark_order_payment((record or {}).get("order_id"), status, "card", "paystack")

    return {
        "verified": status == "success",
        "status": status,
        "reference": ref,
        "provider": "paystack",
        "order_id": (record or {}).get("order_id"),
        "amount": (record or {}).get("amount"),
        "idempotent": False,
    }


@router.post("/paystack/webhook")
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str | None = Header(default=None, alias="X-Paystack-Signature"),
):
    """Paystack server-to-server webhook with HMAC-SHA512 signature verification."""
    raw = await request.body()
    secret = os.getenv("PAYSTACK_SECRET_KEY", "")
    if secret:
        expected = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
        if not x_paystack_signature or not hmac.compare_digest(expected, x_paystack_signature):
            logger.warning("paystack webhook signature mismatch")
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    data = payload.get("data") or {}
    reference = data.get("reference")
    if not reference:
        return {"ok": True}

    already, record = _idempotent_settle(reference, "success" if event == "charge.success" else "failed")
    if already:
        return {"ok": True, "idempotent": True}

    status = "success" if event == "charge.success" else "failed"
    db = get_db()
    db.payments.update_one(
        {"reference": reference},
        {"$set": {
            "status": status,
            "webhook_event": event,
            "webhook_at": _now_iso(),
            "webhook_payload": payload,
        }},
        upsert=True,
    )
    _mark_order_payment((record or {}).get("order_id"), status, "card", "paystack")
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────
# M-PESA (Safaricom Daraja)
# ─────────────────────────────────────────────────────────────────
def _mpesa_live() -> bool:
    return bool(os.getenv("MPESA_CONSUMER_KEY") and os.getenv("MPESA_CONSUMER_SECRET")
                and os.getenv("MPESA_SHORTCODE") and os.getenv("MPESA_PASSKEY"))


def _mpesa_token() -> str | None:
    try:
        consumer = os.environ["MPESA_CONSUMER_KEY"]
        secret = os.environ["MPESA_CONSUMER_SECRET"]
        env = os.getenv("MPESA_ENV", "sandbox")
        host = "https://api.safaricom.co.ke" if env == "production" else "https://sandbox.safaricom.co.ke"
        resp = httpx.get(
            f"{host}/oauth/v1/generate?grant_type=client_credentials",
            auth=(consumer, secret),
            timeout=15,
        )
        return (resp.json() or {}).get("access_token")
    except Exception as exc:
        logger.exception("mpesa token error: %s", exc)
        return None


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
    if _already_paid(order_id):
        raise HTTPException(status_code=409, detail="This order is already paid.")

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

    daraja_request_id = None
    daraja_response = None

    if _mpesa_live():
        try:
            token = _mpesa_token()
            if token:
                env = os.getenv("MPESA_ENV", "sandbox")
                host = "https://api.safaricom.co.ke" if env == "production" else "https://sandbox.safaricom.co.ke"
                shortcode = os.environ["MPESA_SHORTCODE"]
                passkey = os.environ["MPESA_PASSKEY"]
                ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                pwd = base64.b64encode(f"{shortcode}{passkey}{ts}".encode()).decode()
                resp = httpx.post(
                    f"{host}/mpesa/stkpush/v1/processrequest",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "BusinessShortCode": shortcode,
                        "Password": pwd,
                        "Timestamp": ts,
                        "TransactionType": "CustomerPayBillOnline",
                        "Amount": int(round(float(amount))),
                        "PartyA": phone,
                        "PartyB": shortcode,
                        "PhoneNumber": phone,
                        "CallBackURL": os.getenv("MPESA_CALLBACK_URL", ""),
                        "AccountReference": (order_id or checkout_request_id)[:12],
                        "TransactionDesc": "Dukayko order payment",
                    },
                    timeout=20,
                )
                daraja_response = resp.json()
                daraja_request_id = daraja_response.get("CheckoutRequestID")
                if daraja_request_id:
                    # Re-key the payment by the Daraja-issued ID so the callback
                    # (which only carries CheckoutRequestID) can find it.
                    get_db().payments.update_one(
                        {"reference": checkout_request_id},
                        {"$set": {
                            "reference": daraja_request_id,
                            "internal_reference": checkout_request_id,
                            "daraja_response": daraja_response,
                        }},
                    )
                    checkout_request_id = daraja_request_id
        except Exception as exc:
            logger.exception("mpesa stk push exception: %s", exc)

    return {
        "status": "initiated",
        "reference": checkout_request_id,
        "shortcode": os.getenv("MPESA_SHORTCODE", ""),
        "amount": record["amount"],
        "phone": phone,
        "order_id": order_id,
        "provider": "mpesa",
        "message": "Check your phone to complete the M-Pesa payment",
    }


@router.post("/mpesa/callback")
def mpesa_callback(payload: dict = Body(...)):
    """Public Daraja callback. Idempotent — safe to retry."""
    db = get_db()
    body = payload.get("Body") or {}
    cb = body.get("stkCallback") or {}
    ref = cb.get("CheckoutRequestID")
    result_code = cb.get("ResultCode")

    if not ref:
        return {"ResultCode": 0, "ResultDesc": "Accepted"}  # always 200 to Daraja

    status = "success" if result_code == 0 else "failed"
    already, record = _idempotent_settle(ref, status)
    if already:
        return {"ResultCode": 0, "ResultDesc": "Accepted (idempotent)"}

    record = db.payments.find_one({"reference": ref}) or record
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
    _mark_order_payment((record or {}).get("order_id"), status, "mpesa", "mpesa")
    logger.info("mpesa callback ref=%s status=%s order=%s", ref, status, (record or {}).get("order_id"))
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─────────────────────────────────────────────────────────────────
# LIST PAYMENTS
# ─────────────────────────────────────────────────────────────────
@router.get("/list")
def list_payments(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
        q = {"shop_id": {"$in": shop_ids}}
    else:
        q = {}
    return list(db.payments.find(q).sort("created_at", -1).limit(100))
