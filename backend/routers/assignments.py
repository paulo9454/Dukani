from fastapi import APIRouter, Depends, HTTPException
from backend.db.mongo import get_db
from backend.core.deps import require_roles
from datetime import datetime

router = APIRouter(prefix="/api/owner/shops", tags=["assignments"])


@router.post("/{shop_id}/shopkeepers/{user_id}")
def assign_shopkeeper(shop_id: str, user_id: str, user=Depends(require_roles("owner", "admin"))):
    db = get_db()

    shop_query = {"_id": shop_id} if user["role"] == "admin" else {"_id": shop_id, "owner_id": user["_id"]}
    shop = db.shops.find_one(shop_query)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    shopkeeper = db.users.find_one({"_id": user_id, "role": "shopkeeper"})
    if not shopkeeper:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    existing = db.assignments.find_one({"shop_id": shop_id, "shopkeeper_id": user_id})
    if existing:
        return {"message": "Already assigned"}

    db.assignments.insert_one({"shop_id": shop_id, "shopkeeper_id": user_id, "owner_id": shop["owner_id"], "created_at": datetime.utcnow().isoformat()})
    # Keep denormalized user-doc cache in sync for legacy readers + frontend.
    db.users.update_one(
        {"_id": user_id},
        {"$addToSet": {"assigned_shop_ids": shop_id}},
    )
    return {"message": "Assigned successfully"}


@router.post("/{shop_id}/shopkeepers/{user_id}/unassign")
def unassign_shopkeeper(shop_id: str, user_id: str, user=Depends(require_roles("owner", "admin"))):
    db = get_db()

    shop_query = {"_id": shop_id} if user["role"] == "admin" else {"_id": shop_id, "owner_id": user["_id"]}
    shop = db.shops.find_one(shop_query)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    db.assignments.delete_one({"shop_id": shop_id, "shopkeeper_id": user_id})
    db.users.update_one(
        {"_id": user_id},
        {"$pull": {"assigned_shop_ids": shop_id}},
    )
    return {"message": "Unassigned"}
