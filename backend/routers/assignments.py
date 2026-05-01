from fastapi import APIRouter, Depends, HTTPException
from backend.db.mongo import get_db
from backend.core.deps import require_roles
from datetime import datetime

router = APIRouter(prefix="/api/owner/shops", tags=["assignments"])


# =========================
# ➕ ASSIGN SHOPKEEPER
# =========================
@router.post("/{shop_id}/shopkeepers/{user_id}")
def assign_shopkeeper(
    shop_id: str,
    user_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    shop = db.shops.find_one({
        "_id": shop_id,
        "owner_id": user["_id"]
    })

    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    shopkeeper = db.users.find_one({
        "_id": user_id,
        "role": "shopkeeper"
    })

    if not shopkeeper:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    # prevent duplicate assignment
    existing = db.assignments.find_one({
        "shop_id": shop_id,
        "shopkeeper_id": user_id,
        "owner_id": user["_id"]
    })

    if existing:
        return {"message": "Already assigned"}

    db.assignments.insert_one({
        "shop_id": shop_id,
        "shopkeeper_id": user_id,
        "owner_id": user["_id"],
        "created_at": datetime.utcnow().isoformat()
    })

    return {"message": "Assigned successfully"}


# =========================
# ❌ UNASSIGN
# =========================
@router.post("/{shop_id}/shopkeepers/{user_id}/unassign")
def unassign_shopkeeper(
    shop_id: str,
    user_id: str,
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    db.assignments.delete_one({
        "shop_id": shop_id,
        "shopkeeper_id": user_id,
        "owner_id": user["_id"]
    })

    return {"message": "Unassigned"}
