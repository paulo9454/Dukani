from datetime import datetime, timezone, timedelta
from backend.db.mongo import get_db
from backend.services.email_service import send_email


def generate_daily_report(shop):
    db = get_db()

    today = datetime.now(timezone.utc)
    start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    # =========================
    # 📦 ORDERS TODAY
    # =========================
    orders = list(db.orders.find({
        "shop_id": shop["_id"],
        "created_at": {"$gte": start.isoformat()}
    }))

    revenue = 0
    cogs = 0
    product_sales = {}

    for o in orders:
        revenue += float(o.get("total", 0))

        for item in o.get("items", []):
            product = db.products.find_one({"_id": item["product_id"]})
            if not product:
                continue

            buying = float(product.get("buying_price", 0))
            qty = float(item.get("qty", 0))

            cogs += buying * qty

            name = product.get("name", "Unknown")
            product_sales[name] = product_sales.get(name, 0) + qty

    profit = revenue - cogs

    # =========================
    # 📦 STOCK
    # =========================
    products = list(db.products.find({"shop_id": shop["_id"]}))

    low_stock = [
        p for p in products
        if p.get("stock", 0) <= p.get("low_stock_threshold", 5)
    ]

    stock_value = sum(
        float(p.get("stock", 0)) * float(p.get("buying_price", 0))
        for p in products
    )

    top_products = sorted(
        product_sales.items(),
        key=lambda x: x[1],
        reverse=True
    )[:5]

    # =========================
    # 📧 EMAIL BODY
    # =========================
    body = f"""
DAILY SHOP REPORT - {shop.get('name')}

=====================
💰 FINANCIAL SUMMARY
=====================
Revenue: KES {round(revenue, 2)}
Profit: KES {round(profit, 2)}
COGS: KES {round(cogs, 2)}

=====================
📦 INVENTORY
=====================
Stock Value: KES {round(stock_value, 2)}
Low Stock Items: {len(low_stock)}

=====================
🔥 TOP PRODUCTS
=====================
"""

    for name, qty in top_products:
        body += f"- {name}: {qty} sold\n"

    body += "\n\nGenerated automatically by Dukani POS"

    return body


def send_daily_report(shop):
    db = get_db()

    owner = db.users.find_one({"_id": shop.get("owner_id")})

    if not owner or not owner.get("email"):
        return

    report = generate_daily_report(shop)

    send_email(
        to_email=owner["email"],
        subject=f"📊 Daily Sales Report - {shop.get('name')}",
        body=report
    )
