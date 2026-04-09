from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from pydantic import BaseModel, Field
from typing import Literal
import uuid

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class ShopCreateRequest(BaseModel):
    name: str = Field(min_length=2)
    subscription_plan: Literal["pos", "online", "legacy"] = "legacy"


class SubscriptionUpdateRequest(BaseModel):
    plan: Literal["pos", "online", "legacy"]


@router.get("/vendor")
def vendor_dashboard(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    shop_filter = {}
    if user["role"] == "shopkeeper":
        shop_filter = {"_id": {"$in": user.get("assigned_shop_ids", [])}}
    elif user["role"] in {"owner", "partner"}:
        shop_filter = {"owner_id": user["_id"]}

    shops = list(db.shops.find(shop_filter))
    shop_ids = [s["_id"] for s in shops]
    orders = list(db.orders.find({"shop_id": {"$in": shop_ids}})) if shops else []

    damaged = list(db.damaged_stock.find({"shop_id": {"$in": shop_ids}})) if shops else []

    return {
        "shops_count": len(shops),
        "orders_count": len(orders),
        "revenue": round(sum(o.get("total", 0) for o in orders), 2),
        "total_damaged_items": sum(d.get("qty", 0) for d in damaged),
        "loss_value": round(sum(d.get("loss_value", 0) for d in damaged), 2),
        "shops": shops,
        "reminder": "Owners can create multiple shops and assign different shopkeepers per shop.",
    }


@router.get("/admin")
def admin_dashboard(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    return {
        "users": db.users.count_documents({}),
        "shops": db.shops.count_documents({}),
        "orders": db.orders.count_documents({}),
        "payments": db.payments.count_documents({}),
    }


@router.get("/shops")
def list_shops(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.shops.find({"_id": {"$in": user.get("assigned_shop_ids", [])}}))
    if user["role"] in {"owner", "partner"}:
        return list(db.shops.find({"owner_id": user["_id"]}))
    return list(db.shops.find({}))


@router.post("/shops")
def create_shop(payload: ShopCreateRequest, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop_id = str(uuid.uuid4())
    doc = {
        "_id": shop_id,
        "name": payload.name,
        "owner_id": user["_id"],
        "subscription_plan": payload.subscription_plan,
    }
    db.shops.insert_one(doc)
    db.subscriptions.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "shop_id": shop_id,
            "plan": payload.subscription_plan,
            "status": "active",
        }
    )
    return doc


@router.post("/shops/{shop_id}/assign/{staff_id}")
def assign_shopkeeper(shop_id: str, staff_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    staff = db.users.find_one({"_id": staff_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    new_ids = list(set(staff.get("assigned_shop_ids", []) + [shop_id]))
    db.users.update_one({"_id": staff_id}, {"$set": {"assigned_shop_ids": new_ids}})
    return {
        "message": "Assigned",
        "shop_id": shop_id,
        "assigned_shop_ids": sorted(new_ids),
        "note": "A shopkeeper can be assigned to multiple shops.",
    }


@router.put("/shops/{shop_id}/subscription")
def update_subscription(shop_id: str, payload: SubscriptionUpdateRequest, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    plan = payload.plan
    db.shops.update_one({"_id": shop_id}, {"$set": {"subscription_plan": plan}})
    db.subscriptions.update_one({"shop_id": shop_id}, {"$set": {"plan": plan, "status": "active"}}, upsert=True)
    return {"shop_id": shop_id, "plan": plan}


@router.get("/vendor/daily-sales")
def vendor_daily_sales(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        shop_ids = user.get("assigned_shop_ids", [])
    elif user["role"] in {"owner", "partner"}:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]})]
    else:
        shop_ids = [s["_id"] for s in db.shops.find({})]

    orders = list(db.orders.find({"shop_id": {"$in": shop_ids}}))
    return {
        "orders": len(orders),
        "revenue": round(sum(o.get("total", 0) for o in orders), 2),
    }


@router.get("/shops/{shop_id}/assignments")
def shop_assignments(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    staff = list(db.users.find({"role": "shopkeeper", "assigned_shop_ids": shop_id}, {"password_hash": 0}))
    return {"shop_id": shop_id, "shopkeepers": staff}


@router.post("/shops/{shop_id}/assignments/bulk")
def assign_shopkeepers_bulk(shop_id: str, payload: dict, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    staff_ids = payload.get("staff_ids", [])
    if not isinstance(staff_ids, list) or not staff_ids:
        raise HTTPException(status_code=400, detail="staff_ids is required")

    updated = []
    for staff_id in staff_ids:
        staff = db.users.find_one({"_id": staff_id, "role": "shopkeeper"})
        if not staff:
            continue
        new_ids = sorted(list(set(staff.get("assigned_shop_ids", []) + [shop_id])))
        db.users.update_one({"_id": staff_id}, {"$set": {"assigned_shop_ids": new_ids}})
        updated.append({"staff_id": staff_id, "assigned_shop_ids": new_ids})

    return {"shop_id": shop_id, "updated": updated}
