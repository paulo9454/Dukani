from backend.db.mongo import get_db
from backend.services.subscription_service import get_subscription
from fastapi import HTTPException

def is_shop_online(shop: dict) -> bool:
    if not shop:
        return False

    db = get_db()
    try:
        sub = get_subscription(db, shop["_id"])
        return bool(sub["features"]["online"])
    except HTTPException:
        return False


def is_product_visible(product: dict, shop: dict, mode: str = "pos") -> bool:
    if not product or not shop:
        return False

    # must belong to shop
    if product.get("shop_id") != shop.get("_id"):
        return False

    # =========================
    # POS MODE (FULL CONTROL)
    # =========================
    if mode == "pos":
        # POS ignores online flags
        return product.get("stock", 0) >= 0

    # =========================
    # MARKETPLACE MODE
    # =========================
    if not is_shop_online(shop):
        return False

    if not product.get("is_public"):
        return False

    if not product.get("is_online"):
        return False

    if product.get("stock", 0) <= 0:
        return False

    return True
