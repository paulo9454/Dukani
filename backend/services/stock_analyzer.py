from backend.db.mongo import get_db


def analyze_stock_alerts(shop_ids: list[str] | None = None):
    db = get_db()
    alerts = []

    product_filter = {}
    if shop_ids:
        product_filter["shop_id"] = {"$in": shop_ids}

    products = list(db.products.find(product_filter))
    for product in products:
        threshold = product.get("low_stock_threshold", 5)
        if product.get("stock", 0) < threshold:
            alerts.append(
                {
                    "type": "low_stock",
                    "product_id": product["_id"],
                    "shop_id": product["shop_id"],
                    "message": f"{product['name']} stock below threshold",
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
