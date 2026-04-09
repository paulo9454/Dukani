from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


@router.get("/vendors")
def list_vendors():
    db = get_db()
    return list(db.shops.find({}, {"_id": 1, "name": 1, "subscription_plan": 1}))


@router.get("/orders")
def marketplace_orders(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.orders.find({"shop_id": {"$in": user.get("assigned_shop_ids", [])}}))
    return list(db.orders.find({}))


@router.post("/orders/{order_id}/receive")
def receive_marketplace_order(order_id: str, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    order = db.orders.find_one({"_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "shopkeeper" and order["shop_id"] not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned")
    db.orders.update_one({"_id": order_id}, {"$set": {"status": "received"}})
    return db.orders.find_one({"_id": order_id})
