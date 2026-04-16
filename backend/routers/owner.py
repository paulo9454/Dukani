from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
import uuid

router = APIRouter(prefix="/api/owner", tags=["owner"])


@router.get("/shops")
def list_owner_shops(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        return list(db.shops.find({"owner_id": user["_id"]}))
    return list(db.shops.find({}))


@router.post("/shops")
def create_owner_shop(payload: dict, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    name = (payload.get("name") or "").strip()
    subscription_plan = payload.get("subscription_plan", "online")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    shop_id = str(uuid.uuid4())
    doc = {
        "_id": shop_id,
        "name": name,
        "owner_id": user["_id"],
        "subscription_plan": subscription_plan,
    }
    db.shops.insert_one(doc)
    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {"$set": {"shop_id": shop_id, "plan": subscription_plan, "status": "active"}},
        upsert=True,
    )
    return doc


@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}")
def assign_shopkeeper(shop_id: str, shopkeeper_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if user["role"] in {"owner", "partner"} and shop.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Cannot assign outside owned shops")

    staff = db.users.find_one({"_id": shopkeeper_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    assigned = sorted(list(set(staff.get("assigned_shop_ids", []) + [shop_id])))
    db.users.update_one({"_id": shopkeeper_id}, {"$set": {"assigned_shop_ids": assigned}})
    return {"shop_id": shop_id, "shopkeeper_id": shopkeeper_id, "assigned_shop_ids": assigned}


@router.get("/sales")
def owner_sales(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
    else:
        shop_ids = [s["_id"] for s in db.shops.find({}, {"_id": 1})]

    orders = list(db.orders.find({"shop_id": {"$in": shop_ids}})) if shop_ids else []
    return {
        "shops": len(shop_ids),
        "orders": len(orders),
        "revenue": round(sum(o.get("total", 0) for o in orders), 2),
        "sales": orders,
    }


@router.get("/shops/{shop_id}/pos-access")
def owner_pos_access(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if user["role"] in {"owner", "partner"} and shop.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Cannot access POS outside owned shops")

    return {"shop_id": shop_id, "pos_path": f"/apps/pos?shop_id={shop_id}"}
