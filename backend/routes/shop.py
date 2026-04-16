from fastapi import APIRouter, HTTPException, Depends
from backend.db.mongo import get_db
from backend.core.deps import get_current_user
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/api/shops", tags=["shops"])


# =========================
# CREATE SHOP (OWNER ONLY)
# =========================
@router.post("/create")
def create_shop(payload: dict, user=Depends(get_current_user)):
    db = get_db()

    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create shops")

    shop_name = payload.get("name")

    if not shop_name:
        raise HTTPException(status_code=400, detail="Shop name required")

    shop_id = str(uuid.uuid4())

    db.shops.insert_one(
        {
            "_id": shop_id,
            "owner_id": user["_id"],
            "name": shop_name,

            # 💰 per-shop subscription
            "subscription_status": "trial",
            "trial_start": datetime.now(timezone.utc).isoformat(),
            "trial_end": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),

            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {
        "shop_id": shop_id,
        "name": shop_name,
        "subscription_status": "trial",
    }


# =========================
# 🔥 GET MY SHOPS (CRITICAL FIX)
# =========================
@router.get("/my-shops")
def get_my_shops(user=Depends(get_current_user)):
    db = get_db()

    if user["role"] == "owner":
        shops = list(
            db.shops.find(
                {"owner_id": user["_id"]},
                {"_id": 1, "name": 1, "subscription_status": 1},
            )
        )

    elif user["role"] == "shopkeeper":
        shops = list(
            db.shops.find(
                {"_id": {"$in": user.get("assigned_shop_ids", [])}},
                {"_id": 1, "name": 1, "subscription_status": 1},
            )
        )

    else:
        shops = []

    return {"shops": shops}
