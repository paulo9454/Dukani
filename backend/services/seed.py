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

    shop_main = str(uuid.uuid4())
    shop_branch = str(uuid.uuid4())
    shops = [
        {"_id": shop_main, "name": "Seed Main Shop", "owner_id": owner_id, "subscription_plan": "online"},
        {"_id": shop_branch, "name": "Seed Branch Shop", "owner_id": owner_id, "subscription_plan": "online"},
    ]
    for s in shops:
        db.shops.update_one({"_id": s["_id"]}, {"$set": s}, upsert=True)
        db.subscriptions.update_one(
            {"shop_id": s["_id"]},
            {"$set": {"shop_id": s["_id"], "plan": "online", "status": "active", "_id": str(uuid.uuid4())}},
            upsert=True,
        )

    db.users.update_one({"_id": shopkeeper_a}, {"$set": {"assigned_shop_ids": [shop_main]}})
    db.users.update_one({"_id": shopkeeper_b}, {"$set": {"assigned_shop_ids": [shop_branch]}})

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
