from backend.core.celery_app import celery
from backend.core.email import send_email
from backend.db.mongo import get_db
from datetime import datetime, timedelta, timezone


def now():
    return datetime.now(timezone.utc)


@celery.task
def send_daily_reports_task():
    db = get_db()

    since = (now() - timedelta(days=1)).isoformat()

    # =========================
    # SALES DATA
    # =========================
    sales = list(db.sales.find({"created_at": {"$gte": since}}))

    total_sales = sum(s.get("total", 0) for s in sales)

    total_cost = 0
    for s in sales:
        for item in s.get("items", []):
            total_cost += item.get("cost_price", 0) * item.get("qty", 0)

    profit = total_sales - total_cost

    low_stock = list(db.products.find({"stock": {"$lte": 5}}))

    # =========================
    # GET OWNER EMAILS (DEBUG)
    # =========================
    owners = list(db.users.find({"role": "owner"}))
    print("OWNERS FOUND:", owners)

    emails = [o.get("email") for o in owners if o.get("email")]
    print("EMAILS:", emails)

    # =========================
    # BUILD EMAIL
    # =========================
    html = f"""
    <h2>📊 Daily Business Report</h2>

    <p><b>Total Sales:</b> {total_sales}</p>
    <p><b>Total Cost:</b> {total_cost}</p>
    <p><b>Profit:</b> {profit}</p>

    <h3>📦 Low Stock Items</h3>
    <ul>
        {''.join([f"<li>{p['name']} (Stock: {p['stock']})</li>" for p in low_stock])}
    </ul>
    """

    # =========================
    # SEND EMAIL
    # =========================
    for email in emails:
        try:
            print("📨 Sending to:", email)

            send_email(
                to_email=email,
                subject="📊 Dukani Daily Report",
                html_content=html
            )

            print("✅ Sent to:", email)

        except Exception as e:
            print("❌ Email failed:", str(e))

    print("📧 Daily report task finished")

    return {
        "sales": total_sales,
        "profit": profit,
        "low_stock": len(low_stock),
    }
