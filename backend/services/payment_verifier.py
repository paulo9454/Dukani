from fastapi import HTTPException


def verify_payment(payment_method: str, amount: float, payment_meta: dict | None = None):
    """
    Local checkout payment classifier.

    Important security rule:
    Only cash can be confirmed immediately at checkout.
    External/provider payments must stay pending until confirmed by the
    provider-specific payment routes/webhooks. Do not trust frontend metadata
    such as transaction IDs or references as proof of payment.
    """
    payment_meta = payment_meta or {}

    if payment_method == "credit":
        return {"status": "pending", "verified": True}

    if payment_method == "cash":
        return {"status": "confirmed", "verified": True}

    if payment_method in {"mpesa", "paystack", "card"}:
        return {"status": "pending", "verified": False}

    raise HTTPException(status_code=400, detail="Unsupported payment method")
