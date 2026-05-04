from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles, get_assigned_shop_ids
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


@router.get("/vendors")
def list_vendors():
    db = get_db()
    return list(
        db.shops.find(
            {
                "$or": [
                    {"online_enabled": True},
                    {"is_public": True},
                ]
            },
            {"_id": 1, "name": 1, "subscription_plan": 1, "online_enabled": 1, "is_public": 1},
        )
    )


@router.get("/orders")
def marketplace_orders(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(
            db.orders.find({"shop_id": {"$in": get_assigned_shop_ids(user["_id"])}})
            .sort("created_at", -1)
            .limit(200)
        )
    return list(db.orders.find({}).sort("created_at", -1).limit(200))


@router.post("/orders/{order_id}/receive")
def receive_marketplace_order(order_id: str, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "shopkeeper" and order["shop_id"] not in get_assigned_shop_ids(user["_id"]):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned")
    db.orders.update_one({"_id": order_id}, {"$set": {"status": "received"}})
    return db.orders.find_one({"_id": order_id})
