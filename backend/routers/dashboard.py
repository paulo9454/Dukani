from fastapi import APIRouter, Depends
from backend.core.deps import require_roles
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
def dashboard_overview(user=Depends(require_roles("admin", "owner"))):
    db = get_db()

    if user["role"] == "admin":
        shops = list(db.shops.find({}, {"_id": 1, "subscription_plan": 1}))
        payments_query = {}
        subscriptions_query = {"status": "active"}
    else:
        shops = list(db.shops.find({"owner_id": user["_id"]}, {"_id": 1, "subscription_plan": 1}))
        shop_ids = [s["_id"] for s in shops]
        payments_query = {"shop_id": {"$in": shop_ids}}
        subscriptions_query = {"status": "active", "shop_id": {"$in": shop_ids}}

    shop_ids = [s["_id"] for s in shops]
    orders = list(db.orders.find({"shop_id": {"$in": shop_ids}, "payment_status": "confirmed"}))
    payments = list(db.payments.find(payments_query))
    active_subscriptions = db.subscriptions.count_documents(subscriptions_query)

    plan_breakdown = {
        "pos": sum(1 for s in shops if s.get("subscription_plan") == "pos"),
        "online": sum(1 for s in shops if s.get("subscription_plan") == "online"),
        "legacy": sum(1 for s in shops if s.get("subscription_plan") == "legacy"),
    }

    revenue = sum(float(o.get("total", 0)) for o in orders if o.get("payment_status") == "confirmed")

    return {
        "shops": len(shops),
        "orders": len(orders),
        "payments": len(payments),
        "revenue": round(revenue, 2),
        "active_subscriptions": active_subscriptions,
        "subscription_plans": plan_breakdown,
    }


@router.get("/admin")
def admin_dashboard(user=Depends(require_roles("admin"))):
    db = get_db()
    return {
        "users": db.users.count_documents({}),
        "shops": db.shops.count_documents({}),
        "orders": db.orders.count_documents({}),
        "payments": db.payments.count_documents({}),
    }


@router.get("/shops")
def list_shops(user=Depends(require_roles("admin"))):
    db = get_db()
    return list(db.shops.find({}, {"_id": 1, "name": 1, "owner_id": 1, "subscription_plan": 1, "online_enabled": 1, "category": 1, "latitude": 1, "longitude": 1}))


@router.get("/subscriptions")
def subscription_overview(user=Depends(require_roles("admin"))):
    db = get_db()
    return {
        "total": db.subscriptions.count_documents({}),
        "active": db.subscriptions.count_documents({"status": "active"}),
        "inactive": db.subscriptions.count_documents({"status": {"$ne": "active"}}),
        "plans": {
            "pos": db.subscriptions.count_documents({"plan": "pos"}),
            "online": db.subscriptions.count_documents({"plan": "online"}),
            "legacy": db.subscriptions.count_documents({"plan": "legacy"}),
        },
    }
