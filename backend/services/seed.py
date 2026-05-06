from backend.db.mongo import get_db
from backend.core.security import hash_password
import uuid


def seed_full_data():
    db = get_db()

    owner_id = str(uuid.uuid4())
    shopkeeper_a = str(uuid.uuid4())
    shopkeeper_b = str(uuid.uuid4())
    customer_id = str(uuid.uuid4())

    users = [
        {
            "_id": owner_id,
            "email": "owner.seed@dukani.dev",
            "password_hash": hash_password("Dukani@2026"),
            "full_name": "Seed Owner",
            "role": "owner",
            "assigned_shop_ids": [],
        },
        {
            "_id": shopkeeper_a,
            "email": "keeper.a@dukani.dev",
            "password_hash": hash_password("Keeper@2026"),
            "full_name": "Keeper A",
            "role": "shopkeeper",
            "assigned_shop_ids": [],
        },
        {
            "_id": shopkeeper_b,
            "email": "keeper.b@dukani.dev",
            "password_hash": hash_password("Keeper@2026"),
            "full_name": "Keeper B",
            "role": "shopkeeper",
            "assigned_shop_ids": [],
        },
        {
            "_id": customer_id,
            "email": "customer.seed@dukani.dev",
            "password_hash": hash_password("Customer@2026"),
            "full_name": "Seed Customer",
            "role": "customer",
            "assigned_shop_ids": [],
        },
    ]

    for u in users:
        db.users.update_one({"email": u["email"]}, {"$setOnInsert": u}, upsert=True)

    # Resolve actual user IDs (an existing user keeps its old _id on upsert).
    owner_id = db.users.find_one({"email": "owner.seed@dukani.dev"})["_id"]
    shopkeeper_a = db.users.find_one({"email": "keeper.a@dukani.dev"})["_id"]
    shopkeeper_b = db.users.find_one({"email": "keeper.b@dukani.dev"})["_id"]

    shop_main = str(uuid.uuid4())
    shop_branch = str(uuid.uuid4())
    from datetime import datetime, timezone, timedelta
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    trial_end = (now_dt + timedelta(days=30)).isoformat()
    shops = [
        {
            "_id": shop_main, "name": "Seed Main Shop", "owner_id": owner_id,
            "subscription_plan": "pos_online",
            "online_enabled": True, "is_online_enabled": True, "pos_enabled": True,
            "subscription_status": "active",
            "trial_start_at": now, "trial_end_at": trial_end,
        },
        {
            "_id": shop_branch, "name": "Seed Branch Shop", "owner_id": owner_id,
            "subscription_plan": "pos_online",
            "online_enabled": True, "is_online_enabled": True, "pos_enabled": True,
            "subscription_status": "active",
            "trial_start_at": now, "trial_end_at": trial_end,
        },
    ]
    for s in shops:
        db.shops.update_one({"_id": s["_id"]}, {"$set": s}, upsert=True)
        db.subscriptions.update_one(
            {"shop_id": s["_id"]},
            {"$set": {
                "shop_id": s["_id"],
                "plan": "pos_online",
                "status": "active",
                "is_paid": True,
                "trial_start": now,
                "trial_end": trial_end,
            }},
            upsert=True,
        )

    db.users.update_one({"_id": shopkeeper_a}, {"$set": {"assigned_shop_ids": [shop_main]}})
    db.users.update_one({"_id": shopkeeper_b}, {"$set": {"assigned_shop_ids": [shop_branch]}})

    # Canonical source of truth for shopkeeper -> shop linkage.
    db.assignments.update_one(
        {"shop_id": shop_main, "shopkeeper_id": shopkeeper_a},
        {"$setOnInsert": {"shop_id": shop_main, "shopkeeper_id": shopkeeper_a, "owner_id": owner_id, "created_at": now}},
        upsert=True,
    )
    db.assignments.update_one(
        {"shop_id": shop_branch, "shopkeeper_id": shopkeeper_b},
        {"$setOnInsert": {"shop_id": shop_branch, "shopkeeper_id": shopkeeper_b, "owner_id": owner_id, "created_at": now}},
        upsert=True,
    )

    products = [
        {"_id": str(uuid.uuid4()), "shop_id": shop_main, "name": "Seed Phone", "description": "", "price": 300, "stock": 10, "is_public": True, "barcode": "SP-001", "low_stock_threshold": 3},
        {"_id": str(uuid.uuid4()), "shop_id": shop_branch, "name": "Seed Tablet", "description": "", "price": 450, "stock": 8, "is_public": True, "barcode": "ST-001", "low_stock_threshold": 3},
    ]
    for p in products:
        db.products.update_one({"_id": p["_id"]}, {"$set": p}, upsert=True)

    return {
        "message": "Full seed completed",
        "owner_email": "owner.seed@dukani.dev",
        "shopkeeper_emails": ["keeper.a@dukani.dev", "keeper.b@dukani.dev"],
        "customer_email": "customer.seed@dukani.dev",
        "shops": [shop_main, shop_branch],
    }
