def is_shop_online(shop: dict) -> bool:
    if not shop:
        return False

    return bool(
        shop.get("online_enabled", False)
        or shop.get("subscription_plan") == "online"
    )


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
