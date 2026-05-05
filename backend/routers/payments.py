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
from datetime import datetime, timedelta, timezone

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
    # Optional subscription metadata — set by /owner/shops/{id}/subscribe
    subscription_plan = payload.get("subscription_plan")
    payment_type = payload.get("payment_type") or ("subscription" if subscription_plan else "order")

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
    metadata = {
        "order_id": order_id,
        "shop_id": shop_id,
        "payment_type": payment_type,
    }
    if subscription_plan:
        metadata["subscription_plan"] = subscription_plan
        metadata["user_id"] = user["_id"] if user else None

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
        "payment_type": payment_type,
        "subscription_plan": subscription_plan,
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
                    "metadata": metadata,
                    "callback_url": payload.get("callback_url"),
                },
                timeout=15,
            )
            data = resp.json()
            if resp.status_code >= 400 or not data.get("status"):
                logger.error("paystack init failed: %s", data)
            authorization_url = (data.get("data") or {}).get("authorization_url")
            logger.info(
                "paystack init ok reference=%s shop_id=%s plan=%s amount=%s",
                reference, shop_id, subscription_plan, record["amount"],
            )
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


def _activate_subscription(payment: dict) -> bool:
    """Flip a shop's subscription state after a verified Paystack payment.

    Called from BOTH the webhook and the return-to-site verify endpoint so
    activation is resilient to webhook delivery issues. Idempotent — only
    activates once per payment record.
    """
    if not payment:
        return False
    if payment.get("status") != "success":
        return False
    if payment.get("subscription_activated_at"):
        return False  # already activated
    plan = payment.get("subscription_plan")
    shop_id = payment.get("shop_id")
    if not plan or not shop_id:
        return False
    if plan not in {"pos", "pos_online"}:
        logger.warning("refusing to activate unknown plan: %s", plan)
        return False

    db = get_db()
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=30)
    online = plan == "pos_online"

    db.shops.update_one(
        {"_id": shop_id},
        {"$set": {
            "subscription_plan": plan,
            "subscription_status": "active",
            "online_enabled": online,
            "is_online_enabled": online,
            "subscription_start": now.isoformat(),
            "subscription_end": end.isoformat(),
            "subscription_last_reference": payment.get("reference"),
        }},
    )
    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {"$set": {
            "shop_id": shop_id,
            "plan": plan,
            "status": "active",
            "is_paid": True,
            "payment_reference": payment.get("reference"),
            "start": now.isoformat(),
            "end": end.isoformat(),
            "updated_at": now.isoformat(),
        }},
        upsert=True,
    )
    db.payments.update_one(
        {"reference": payment.get("reference")},
        {"$set": {"subscription_activated_at": now.isoformat()}},
    )
    logger.info(
        "subscription activated shop=%s plan=%s reference=%s",
        shop_id, plan, payment.get("reference"),
    )
    return True


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

    # Subscription activation — safe to call even if payment is not a sub.
    activated = False
    if status == "success":
        fresh = db.payments.find_one({"reference": ref})
        activated = _activate_subscription(fresh)

    return {
        "verified": status == "success",
        "status": status,
        "reference": ref,
        "provider": "paystack",
        "order_id": (record or {}).get("order_id"),
        "amount": (record or {}).get("amount"),
        "idempotent": False,
        "subscription_activated": activated,
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
    logger.info("paystack webhook received event=%s reference=%s", event, reference)
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
    # If Paystack's metadata has a subscription_plan + shop_id we flip the
    # shop's plan here. Helper is idempotent and will no-op if already done
    # by the return-to-site verify call.
    activated = False
    if status == "success":
        # Merge metadata from the webhook so /verify doesn't need to have
        # been called first.
        meta = (data.get("metadata") or {}) if isinstance(data.get("metadata"), dict) else {}
        if meta:
            merge = {}
            if meta.get("subscription_plan") and not (record or {}).get("subscription_plan"):
                merge["subscription_plan"] = meta.get("subscription_plan")
            if meta.get("shop_id") and not (record or {}).get("shop_id"):
                merge["shop_id"] = meta.get("shop_id")
            if meta.get("payment_type") and not (record or {}).get("payment_type"):
                merge["payment_type"] = meta.get("payment_type")
            if merge:
                db.payments.update_one({"reference": reference}, {"$set": merge})
        fresh = db.payments.find_one({"reference": reference})
        activated = _activate_subscription(fresh)
    _mark_order_payment((record or {}).get("order_id"), status, "card", "paystack")
    return {"ok": True, "subscription_activated": activated}


# ─────────────────────────────────────────────────────────────────
# M-PESA (Safaricom Daraja) — per-shop config with env fallback
# ─────────────────────────────────────────────────────────────────
MPESA_MAX_RETRIES = 3
MPESA_RETRY_COOLDOWN_SECS = 15  # prevents STK-push spam


def _mpesa_cfg(shop: dict | None) -> dict:
    """Resolve M-Pesa config. Shop-level fields win over env vars so each
    owner can wire their own PayBill/Till. Falls back to env (useful in
    dev/sandbox). Returns dict with consumer_key/consumer_secret/shortcode/
    passkey/env/business_name — or empty strings when unset."""
    shop = shop or {}
    return {
        "consumer_key": shop.get("mpesa_consumer_key") or os.getenv("MPESA_CONSUMER_KEY", ""),
        "consumer_secret": shop.get("mpesa_consumer_secret") or os.getenv("MPESA_CONSUMER_SECRET", ""),
        "shortcode": shop.get("mpesa_shortcode") or os.getenv("MPESA_SHORTCODE", ""),
        "passkey": shop.get("mpesa_passkey") or os.getenv("MPESA_PASSKEY", ""),
        "env": shop.get("mpesa_env") or os.getenv("MPESA_ENV", "sandbox"),
        "business_name": shop.get("mpesa_business_name") or shop.get("name") or "Dukayko",
    }


def _mpesa_cfg_complete(cfg: dict) -> bool:
    return bool(cfg["consumer_key"] and cfg["consumer_secret"]
                and cfg["shortcode"] and cfg["passkey"])


def _mpesa_token_for(cfg: dict) -> str | None:
    try:
        host = "https://api.safaricom.co.ke" if cfg["env"] == "production" else "https://sandbox.safaricom.co.ke"
        resp = httpx.get(
            f"{host}/oauth/v1/generate?grant_type=client_credentials",
            auth=(cfg["consumer_key"], cfg["consumer_secret"]),
            timeout=15,
        )
        return (resp.json() or {}).get("access_token")
    except Exception as exc:
        logger.exception("mpesa token error: %s", exc)
        return None


def _stk_push(cfg: dict, order_id: str | None, amount: float, phone: str) -> tuple[str, dict | None]:
    """Fire a Daraja STK push using the given shop config. Returns
    (checkout_request_id, raw_response). When cfg is incomplete we fall back
    to a sandbox-safe stub so dev/preview keeps flowing."""
    checkout_request_id = f"MPESA-{uuid.uuid4().hex[:16]}"
    if not _mpesa_cfg_complete(cfg):
        return checkout_request_id, None
    try:
        token = _mpesa_token_for(cfg)
        if not token:
            return checkout_request_id, None
        host = "https://api.safaricom.co.ke" if cfg["env"] == "production" else "https://sandbox.safaricom.co.ke"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        pwd = base64.b64encode(f"{cfg['shortcode']}{cfg['passkey']}{ts}".encode()).decode()
        resp = httpx.post(
            f"{host}/mpesa/stkpush/v1/processrequest",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "BusinessShortCode": cfg["shortcode"],
                "Password": pwd,
                "Timestamp": ts,
                "TransactionType": "CustomerPayBillOnline",
                "Amount": int(round(float(amount))),
                "PartyA": phone,
                "PartyB": cfg["shortcode"],
                "PhoneNumber": phone,
                "CallBackURL": os.getenv("MPESA_CALLBACK_URL", ""),
                "AccountReference": (order_id or checkout_request_id)[:12],
                "TransactionDesc": f"{cfg['business_name']} order payment"[:20],
            },
            timeout=20,
        )
        daraja = resp.json()
        daraja_id = daraja.get("CheckoutRequestID")
        return (daraja_id or checkout_request_id), daraja
    except Exception as exc:
        logger.exception("mpesa stk push exception: %s", exc)
        return checkout_request_id, None


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

    db = get_db()
    order = _get_order_or_none(order_id)
    if order:
        amount = float(order.get("total") or order.get("total_amount") or 0)
        shop_id = order.get("shop_id")
    if not amount:
        raise HTTPException(status_code=400, detail="amount or order_id is required")

    shop = db.shops.find_one({"_id": shop_id}) if shop_id else None
    cfg = _mpesa_cfg(shop)

    # If shop lookup succeeded and it has NO config and there's no env
    # fallback either, fail early with a clear merchant-facing message.
    if shop and not _mpesa_cfg_complete(cfg) and not os.getenv("MPESA_CONSUMER_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Shop has not configured M-Pesa yet. Ask the owner to add their Daraja keys in Shop Settings.",
        )

    checkout_request_id, daraja_response = _stk_push(cfg, order_id, amount, phone)

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
        "daraja_response": daraja_response,
        "retry_count": 0,
    }
    _persist_payment(record)
    if order_id:
        _mark_order_payment(order_id, "pending", "mpesa", "mpesa")
        # track retry budget on the order
        db.orders.update_one(
            {"_id": order_id},
            {"$setOnInsert": {"mpesa_retry_count": 0}, "$set": {"last_stk_at": _now_iso()}},
            upsert=False,
        )

    return {
        "status": "initiated",
        "reference": checkout_request_id,
        "shortcode": cfg["shortcode"],
        "amount": record["amount"],
        "phone": phone,
        "order_id": order_id,
        "provider": "mpesa",
        "message": "Check your phone to complete the M-Pesa payment",
    }


@router.post("/mpesa/retry")
def mpesa_retry(
    payload: dict = Body(...),
    user=Depends(get_current_user_optional),
):
    """Re-send an STK push for an existing order without creating a new
    order or touching stock. Enforces a retry limit + cooldown to stop
    abuse / accidental spam."""
    order_id = (payload.get("order_id") or "").strip()
    phone = (payload.get("phone") or payload.get("phone_number") or "").strip()

    if not order_id:
        raise HTTPException(status_code=400, detail="order_id is required")
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "success":
        raise HTTPException(status_code=409, detail="This order is already paid.")

    # Authorise: the phone on the order must match the caller's phone
    # (phone-based guest auth) — or the caller is the shop owner / admin.
    info = order.get("customer_info") or {}
    order_phone = (info.get("phone") or order.get("phone_number") or "").strip()
    if order_phone and order_phone != phone:
        if not user or user.get("role") not in {"owner", "admin", "partner"}:
            raise HTTPException(status_code=403, detail="Phone does not match this order")

    # Retry budget & cooldown
    retry_count = int(order.get("mpesa_retry_count") or 0)
    if retry_count >= MPESA_MAX_RETRIES:
        raise HTTPException(
            status_code=429,
            detail=f"M-Pesa retry limit reached ({MPESA_MAX_RETRIES}). Please start a new checkout.",
        )
    last_stk = order.get("last_stk_at")
    if last_stk:
        try:
            last_dt = datetime.fromisoformat(last_stk.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - last_dt).total_seconds() < MPESA_RETRY_COOLDOWN_SECS:
                raise HTTPException(
                    status_code=429,
                    detail="Please wait a few seconds before retrying.",
                )
        except ValueError:
            pass

    amount = float(order.get("total") or order.get("total_amount") or 0)
    shop = db.shops.find_one({"_id": order.get("shop_id")}) if order.get("shop_id") else None
    cfg = _mpesa_cfg(shop)

    if shop and not _mpesa_cfg_complete(cfg) and not os.getenv("MPESA_CONSUMER_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Shop has not configured M-Pesa yet.",
        )

    checkout_request_id, daraja_response = _stk_push(cfg, order_id, amount, phone)

    _persist_payment({
        "_id": str(uuid.uuid4()),
        "reference": checkout_request_id,
        "provider": "mpesa",
        "amount": amount,
        "currency": "KES",
        "shop_id": order.get("shop_id"),
        "order_id": order_id,
        "user_id": user["_id"] if user else None,
        "phone": phone,
        "status": "pending",
        "created_at": _now_iso(),
        "daraja_response": daraja_response,
        "is_retry": True,
        "retry_count": retry_count + 1,
    })
    db.orders.update_one(
        {"_id": order_id},
        {"$inc": {"mpesa_retry_count": 1}, "$set": {"last_stk_at": _now_iso(), "payment_status": "pending"}},
    )

    return {
        "success": True,
        "reference": checkout_request_id,
        "retries_left": MPESA_MAX_RETRIES - (retry_count + 1),
        "message": "New M-Pesa prompt sent. Check your phone.",
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

    # 💳 If this STK was a credit-ledger settlement, decrement the balance.
    if status == "success" and (record or {}).get("payment_type") == "credit_settlement":
        ledger_id = record.get("credit_ledger_id")
        amt = float(record.get("amount") or 0)
        if ledger_id and amt > 0:
            ledger = db.credit_customers.find_one({"_id": ledger_id})
            if ledger:
                new_balance = max(round(ledger.get("balance", 0) - amt, 2), 0)
                db.credit_customers.update_one(
                    {"_id": ledger_id},
                    {"$set": {"balance": new_balance}},
                )
                db.credit_payments_history.insert_one({
                    "_id": str(uuid.uuid4()),
                    "ledger_id": ledger_id,
                    "customer_id": ledger.get("customer_id"),
                    "shop_id": ledger.get("shop_id"),
                    "amount": amt,
                    "method": "mpesa_stk",
                    "type": "credit_payment",
                    "reference": ref,
                    "created_at": _now_iso(),
                })
                logger.info(
                    "credit ledger=%s reduced by %.2f via stk ref=%s, new_balance=%.2f",
                    ledger_id, amt, ref, new_balance,
                )

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
