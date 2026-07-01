from datetime import datetime, timezone
import uuid

from fastapi import HTTPException


VALUE_SOURCES = {"cash_deposit", "mpesa_deposit", "voucher_deposit", "adjustment"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def round2(value) -> float:
    return round(float(value or 0), 2)


def ensure_account_shape(db, account: dict) -> dict:
    """
    Backward-compatible customer account shape.

    Existing records may only have:
      balance, total_amount, amount_paid

    New model adds:
      debt_balance
      customer_balance
      voucher_balance
      voucher_count
    """
    if not account:
        return account

    debt_balance = round2(account.get("debt_balance", account.get("balance", 0)))
    customer_balance = round2(account.get("customer_balance", 0))
    voucher_balance = round2(account.get("voucher_balance", 0))
    voucher_count = float(account.get("voucher_count", 0) or 0)

    patch = {}
    if "debt_balance" not in account:
        patch["debt_balance"] = debt_balance
    if "customer_balance" not in account:
        patch["customer_balance"] = customer_balance
    if "voucher_balance" not in account:
        patch["voucher_balance"] = voucher_balance
    if "voucher_count" not in account:
        patch["voucher_count"] = voucher_count
    if "account_type" not in account:
        patch["account_type"] = "customer_account"

    if patch:
        patch["updated_at"] = now_iso()
        db.credit_customers.update_one({"_id": account["_id"]}, {"$set": patch})
        account.update(patch)

    return account


def create_account_transaction(
    db,
    account: dict,
    tx_type: str,
    amount: float,
    user_id: str | None = None,
    source: str | None = None,
    description: str | None = None,
    metadata: dict | None = None,
):
    tx = {
        "_id": str(uuid.uuid4()),
        "account_id": account["_id"],
        "credit_id": account["_id"],
        "ledger_id": account["_id"],
        "shop_id": account.get("shop_id"),
        "customer_name": account.get("customer_name") or account.get("name"),
        "phone": account.get("phone"),
        "type": tx_type,
        "source": source or tx_type,
        "amount": round2(amount),
        "description": description,
        "metadata": metadata or {},
        "created_by": user_id,
        "created_at": now_iso(),
    }
    db.customer_account_transactions.insert_one(tx)
    return tx


def add_customer_value(
    db,
    account_id: str,
    amount: float,
    source: str,
    user_id: str | None = None,
    voucher_count: float | None = None,
    voucher_value: float | None = None,
    description: str | None = None,
):
    """
    Adds stored value to a customer account.

    Voucher is not a POS payment method. Voucher deposits become stored value.
    """
    if source not in VALUE_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid customer value source")

    amount = round2(amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    account = db.credit_customers.find_one({"_id": account_id})
    if not account:
        raise HTTPException(status_code=404, detail="Customer account not found")
    account = ensure_account_shape(db, account)

    field = "voucher_balance" if source == "voucher_deposit" else "customer_balance"

    update = {
        "$inc": {field: amount},
        "$set": {
            "updated_at": now_iso(),
            "account_type": "customer_account",
        },
    }

    if source == "voucher_deposit" and voucher_count:
        update["$inc"]["voucher_count"] = float(voucher_count)

    db.credit_customers.update_one({"_id": account_id}, update)

    return create_account_transaction(
        db,
        account,
        source,
        amount,
        user_id=user_id,
        source=source,
        description=description,
        metadata={
            "voucher_count": voucher_count,
            "voucher_value": voucher_value,
        },
    )


def apply_credit_sale_to_account(
    db,
    account_id: str,
    sale_total: float,
    order_id: str,
    user_id: str | None = None,
):
    """
    POS credit checkout rule:
      1. Use customer_balance first.
      2. Use voucher_balance second.
      3. Only the remaining amount becomes debt.
    """
    sale_total = round2(sale_total)
    if sale_total <= 0:
        raise HTTPException(status_code=400, detail="Sale total must be greater than 0")

    account = db.credit_customers.find_one({"_id": account_id})
    if not account:
        raise HTTPException(status_code=404, detail="Customer account not found")
    account = ensure_account_shape(db, account)

    customer_balance = round2(account.get("customer_balance", 0))
    voucher_balance = round2(account.get("voucher_balance", 0))
    debt_balance = round2(account.get("debt_balance", account.get("balance", 0)))

    used_customer_balance = min(customer_balance, sale_total)
    remaining = round2(sale_total - used_customer_balance)

    used_voucher_balance = min(voucher_balance, remaining)
    remaining = round2(remaining - used_voucher_balance)

    new_customer_balance = round2(customer_balance - used_customer_balance)
    new_voucher_balance = round2(voucher_balance - used_voucher_balance)
    new_debt_balance = round2(debt_balance + remaining)

    status = "paid" if new_debt_balance <= 0 else "open"

    db.credit_customers.update_one(
        {"_id": account_id},
        {"$set": {
            "customer_balance": new_customer_balance,
            "voucher_balance": new_voucher_balance,
            "debt_balance": new_debt_balance,
            "balance": new_debt_balance,  # legacy compatibility
            "status": status,
            "updated_at": now_iso(),
            "account_type": "customer_account",
        }},
    )

    create_account_transaction(
        db,
        account,
        "pos_credit_sale",
        sale_total,
        user_id=user_id,
        source="pos",
        description="POS credit sale",
        metadata={
            "order_id": order_id,
            "sale_total": sale_total,
            "customer_balance_used": used_customer_balance,
            "voucher_balance_used": used_voucher_balance,
            "debt_added": remaining,
            "debt_balance_after": new_debt_balance,
            "customer_balance_after": new_customer_balance,
            "voucher_balance_after": new_voucher_balance,
        },
    )

    return {
        "sale_total": sale_total,
        "customer_balance_used": used_customer_balance,
        "voucher_balance_used": used_voucher_balance,
        "debt_added": remaining,
        "debt_balance": new_debt_balance,
        "customer_balance": new_customer_balance,
        "voucher_balance": new_voucher_balance,
    }
