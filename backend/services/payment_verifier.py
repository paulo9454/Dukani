from fastapi import HTTPException


def verify_payment(payment_method: str, amount: float, payment_meta: dict | None = None):
    payment_meta = payment_meta or {}

    if payment_method == "credit":
        return {"status": "pending", "verified": True}

    if payment_method == "cash":
        return {"status": "confirmed", "verified": True}

    if payment_method == "card":
        # legacy compatibility
        return {"status": "confirmed", "verified": True}

    if payment_method == "mpesa":
        tx_id = payment_meta.get("transaction_id")
        phone = payment_meta.get("phone_number")
        paid_amount = payment_meta.get("amount")
        if not tx_id or not phone:
            raise HTTPException(status_code=400, detail="M-Pesa verification requires transaction_id and phone_number")
        if paid_amount is not None and float(paid_amount) < float(amount):
            raise HTTPException(status_code=400, detail="M-Pesa amount mismatch")
        return {"status": "confirmed", "verified": True}

    if payment_method == "paystack":
        reference = payment_meta.get("paystack_reference") or payment_meta.get("reference")
        paid_amount = payment_meta.get("amount")
        if not reference:
            raise HTTPException(status_code=400, detail="Paystack verification requires reference")
        if paid_amount is not None and float(paid_amount) < float(amount):
            raise HTTPException(status_code=400, detail="Paystack amount mismatch")
        return {"status": "confirmed", "verified": True}

    raise HTTPException(status_code=400, detail="Unsupported payment method")
