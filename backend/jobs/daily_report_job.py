from backend.db.mongo import get_db
from backend.services.daily_report import send_daily_report
import time


def run_daily_reports():
    db = get_db()

    shops = list(db.shops.find({}))

    for shop in shops:
        try:
            send_daily_report(shop)
        except Exception as e:
            print(f"Report failed for {shop['_id']}: {e}")
