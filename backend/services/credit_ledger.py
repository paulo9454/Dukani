from datetime import datetime, timezone
import uuid
from fastapi import HTTPException

VOUCHER_VALUE = 60.0
ENTRY_TYPES = {"credit_taken", "cash_paid", "voucher", "adjustment"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_entry_amount(entry_type: str, payload: dict) -> tuple[float, int, float]:
    """
    Returns: amount, voucher_count, voucher_value

    credit_taken and adjustment increase balance.
    cash_paid and voucher decrease balance.
    """
    if entry_type not in ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Invalid ledger entry type")

    voucher_count = int(payload.get("voucher_count") or 0)
    voucher_value = float(payload.get("voucher_value") or VOUCHER_VALUE)

    if entry_type == "voucher":
        if voucher_count <= 0:
            raise HTTPException(status_code=400, detail="voucher_count must be greater than 0")
        amount = round(voucher_count * voucher_value, 2)
        return amount, voucher_count, voucher_value

    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a number")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than 0")

    return round(amount, 2), voucher_count, voucher_value


def signed_amount(entry_type: str, amount: float) -> float:
    if entry_type in {"cash_paid", "voucher"}:
        return -abs(amount)
    return abs(amount)


def add_credit_ledger_entry(db, credit: dict, payload: dict, user: dict) -> dict:
    entry_type = payload.get("type")
    amount, voucher_count, voucher_value = compute_entry_amount(entry_type, payload)
    signed = signed_amount(entry_type, amount)

    current_balance = float(credit.get("balance") or 0)
    new_balance = round(max(current_balance + signed, 0), 2)

    now = now_iso()
    entry = {
        "_id": str(uuid.uuid4()),
        "credit_id": credit["_id"],
        "ledger_id": credit["_id"],
        "shop_id": credit.get("shop_id"),
        "customer_name": credit.get("customer_name") or credit.get("name"),
        "phone": credit.get("phone"),
        "type": entry_type,
        "amount": amount,
        "signed_amount": signed,
        "voucher_count": voucher_count if entry_type == "voucher" else 0,
        "voucher_value": voucher_value if entry_type == "voucher" else None,
        "description": (payload.get("description") or "").strip() or None,
        "date": payload.get("date") or now.split("T")[0],
        "running_balance": new_balance,
        "created_by": user.get("_id"),
        "created_at": now,
    }

    total_amount = max(float(credit.get("total_amount") or 0) + (amount if signed > 0 else 0), 0)
    amount_paid = max(float(credit.get("amount_paid") or 0) + (amount if signed < 0 else 0), 0)
    status = "paid" if new_balance <= 0 else "open"

    update_result = db.credit_customers.update_one(
        {"_id": credit["_id"], "balance": credit.get("balance", 0)},
        {"$set": {
            "balance": new_balance,
            "total_amount": round(total_amount, 2),
            "amount_paid": round(amount_paid, 2),
            "status": status,
            "updated_at": now,
        }},
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Credit changed while saving. Please retry.")

    db.credit_ledger.insert_one(entry)

    return entry
