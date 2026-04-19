from datetime import datetime, timezone
import uuid


# =========================
# RECEIPT NUMBER GENERATOR
# =========================
def generate_receipt_number(shop_id: str) -> str:
    """
    Human readable POS receipt number
    Format: SHOPCODE-YYYYMMDD-RANDOM
    """

    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    short_id = str(uuid.uuid4())[:6].upper()

    return f"RCPT-{shop_id[:6].upper()}-{date}-{short_id}"


# =========================
# BUILD RECEIPT OBJECT
# =========================
def build_receipt(order: dict, shop: dict, operator: dict = None):
    """
    Converts order -> printable POS receipt
    """

    return {
        "receipt_number": generate_receipt_number(order["shop_id"]),
        "order_id": order["_id"],
        "shop": {
            "id": shop["_id"],
            "name": shop.get("name"),
        },
        "items": order["items"],
        "subtotal": order.get("subtotal", order.get("total")),
        "tax": order.get("tax_amount", 0),
        "discount": order.get("discount", 0),
        "total": order["total"],
        "payment_method": order.get("payment_method"),
        "payment_status": order.get("payment_status"),
        "status": order.get("status"),
        "cashier": {
            "id": operator["_id"] if operator else None,
            "name": operator.get("name") if operator else "SYSTEM",
        },
        "created_at": order.get("created_at", datetime.now(timezone.utc).isoformat()),
        "printed": False,
    }
