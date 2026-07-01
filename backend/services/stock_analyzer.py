from backend.db.mongo import get_db


def analyze_stock_alerts(shop_ids: list[str] | None = None):
    db = get_db()
    alerts = []

    product_filter = {}
    if shop_ids:
        product_filter["shop_id"] = {"$in": shop_ids}

    products = list(db.products.find(product_filter))
    for product in products:
        threshold = int(product.get("low_stock_threshold", 5) or 5)
        ptype = product.get("product_type") or "standard"

        if ptype == "unit_based":
            # Compute remaining packs of the SMALLEST sellable unit so the
            # threshold is meaningful (e.g. 2kg sugar → 8 × 250g packs left).
            base_qty = float(product.get("base_stock_quantity", 0) or 0)
            units = product.get("selling_units") or []
            unit_qtys = [
                float(u.get("quantity") or 0)
                for u in units
                if float(u.get("quantity") or 0) > 0
            ]
            smallest = min(unit_qtys) if unit_qtys else 0
            packs_left = int(base_qty // smallest) if smallest else 0
            if packs_left <= threshold:
                msg = (
                    f"{product['name']} sold out"
                    if packs_left <= 0
                    else f"{product['name']} only {packs_left} packs left"
                )
                alerts.append(
                    {
                        "type": "low_stock",
                        "product_id": product["_id"],
                        "shop_id": product["shop_id"],
                        "message": msg,
                        "remaining": packs_left,
                        "threshold": threshold,
                        "product_type": "unit_based",
                    }
                )
        elif ptype == "variant":
            # Each variant tracks its own stock — alert per variant so the
            # owner sees exactly which size is low.
            for v in product.get("variants") or []:
                v_stock = int(v.get("stock", 0) or 0)
                v_threshold = int(
                    v.get("low_stock_threshold", threshold) or threshold,
                )
                if v_stock <= v_threshold:
                    name = v.get("name") or "?"
                    msg = (
                        f"{product['name']} ({name}) sold out"
                        if v_stock <= 0
                        else f"{product['name']} ({name}) only {v_stock} left"
                    )
                    alerts.append(
                        {
                            "type": "low_stock",
                            "product_id": product["_id"],
                            "shop_id": product["shop_id"],
                            "variant_name": name,
                            "message": msg,
                            "remaining": v_stock,
                            "threshold": v_threshold,
                            "product_type": "variant",
                        }
                    )
        else:
            stock = int(product.get("stock", 0) or 0)
            if stock <= threshold:
                msg = (
                    f"{product['name']} sold out"
                    if stock <= 0
                    else f"{product['name']} only {stock} left"
                )
                alerts.append(
                    {
                        "type": "low_stock",
                        "product_id": product["_id"],
                        "shop_id": product["shop_id"],
                        "message": msg,
                        "remaining": stock,
                        "threshold": threshold,
                        "product_type": "standard",
                    }
                )

    sales_pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "qty_sold": {"$sum": "$items.qty"}}},
    ]
    sales = {s["_id"]: s["qty_sold"] for s in db.orders.aggregate(sales_pipeline)}
    for product in products:
        if sales.get(product["_id"], 0) >= 20:
            alerts.append(
                {
                    "type": "high_velocity",
                    "product_id": product["_id"],
                    "shop_id": product["shop_id"],
                    "message": f"{product['name']} has high sales velocity",
                }
            )

    damage_pipeline = [
        {"$group": {"_id": "$product_id", "damaged_qty": {"$sum": "$qty"}}},
    ]
    damage_rates = {d["_id"]: d["damaged_qty"] for d in db.damaged_stock.aggregate(damage_pipeline)}
    for product in products:
        damaged_qty = damage_rates.get(product["_id"], 0)
        if damaged_qty >= 10:
            alerts.append(
                {
                    "type": "high_damage_rate",
                    "product_id": product["_id"],
                    "shop_id": product["shop_id"],
                    "message": f"{product['name']} has high damage rate",
                }
            )

    return alerts
