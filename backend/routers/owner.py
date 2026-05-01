from fastapi import APIRouter, Depends, HTTPException, Body
from backend.core.deps import require_roles
from backend.db.mongo import get_db
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/owner", tags=["owner"])


# =========================
# HELPERS
# =========================
def _is_owner_scope(user: dict, shop: dict) -> bool:
    if user["role"] == "admin":
        return True
    return shop.get("owner_id") == user["_id"]


def _normalize_id(doc: dict):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# =========================
# 🔥 SUBSCRIPTION ACCESS CHECK
# =========================
def check_shop_access(shop_id: str):
    db = get_db()

    sub = db.subscriptions.find_one({"shop_id": shop_id})
    if not sub:
        raise HTTPException(status_code=403, detail="No subscription")

    now = datetime.utcnow()

    # 🟢 TRIAL → POS ONLY
    if sub.get("plan") == "trial_pos":
        if sub.get("trial_end") and sub["trial_end"] > now:
            return {"pos": True, "online": False, "trial": True}

        raise HTTPException(
            status_code=403,
            detail="Trial expired. Please subscribe.",
        )

    # 💳 PAID
    if sub.get("is_paid"):
        if sub.get("plan") == "pos":
            return {"pos": True, "online": False}

        if sub.get("plan") == "pos_online":
            return {"pos": True, "online": True}

    raise HTTPException(status_code=403, detail="Subscription inactive")


# =========================
# LIST SHOPS
# =========================
@router.get("/shops")
def list_owner_shops(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()

    if user["role"] in {"owner", "partner"}:
        query = {"owner_id": user["_id"]}
    else:
        query = {}

    shops = list(db.shops.find(query))
    return [_normalize_id(s) for s in shops]


# =========================
# CREATE SHOP (🔥 TRIAL POS)
# =========================
@router.post("/shops")
def create_owner_shop(
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    shop_id = str(uuid.uuid4())

    shop_doc = {
        "_id": shop_id,
        "name": name,
        "owner_id": user["_id"],
        "subscription_plan": "trial_pos",  # 🔥 always start as trial
        "online_enabled": False,
        "category": payload.get("category"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "address": payload.get("address"),
    }

    db.shops.insert_one(shop_doc)

    # 🔥 14 DAY TRIAL
    trial_end = datetime.utcnow() + timedelta(days=14)

    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {
            "$set": {
                "shop_id": shop_id,
                "plan": "trial_pos",
                "status": "active",
                "trial_end": trial_end,
                "is_paid": False,
            }
        },
        upsert=True,
    )

    return {
        "message": "Shop created with 14-day POS trial",
        "shop": _normalize_id(shop_doc),
    }


# =========================
# 🔥 SUBSCRIBE SHOP
# =========================
@router.post("/shops/{shop_id}/subscribe")
def subscribe_shop(
    shop_id: str,
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin")),
):
    db = get_db()

    plan = payload.get("plan")

    if plan not in {"pos", "pos_online"}:
        raise HTTPException(status_code=400, detail="Invalid plan")

    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {
            "$set": {
                "plan": plan,
                "is_paid": True,
                "status": "active",
            }
        },
    )

    return {"message": f"Subscribed to {plan}"}


# =========================
# DELETE SHOP
# =========================
@router.delete("/shops/{shop_id}")
def delete_shop(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})

    if not shop:
        return {"message": "Shop already deleted"}

    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    db.users.update_many(
        {"assigned_shop_ids": shop_id},
        {"$pull": {"assigned_shop_ids": shop_id}},
    )

    db.shops.delete_one({"_id": shop_id})
    db.subscriptions.delete_one({"shop_id": shop_id})

    return {"message": "Shop deleted successfully"}


# =========================
# SHOPKEEPERS LIST
# =========================
@router.get("/shopkeepers")
def list_shopkeepers(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()

    users = list(
        db.users.find(
            {"role": "shopkeeper"},
            {"password": 0, "password_hash": 0},
        )
    )

    return [_normalize_id(u) for u in users]


# =========================
# ASSIGN SHOPKEEPER
# =========================
@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}")
def assign_shopkeeper(
    shop_id: str,
    shopkeeper_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    staff = db.users.find_one({"_id": shopkeeper_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    assigned = set(staff.get("assigned_shop_ids", []))
    assigned.add(shop_id)

    db.users.update_one(
        {"_id": shopkeeper_id},
        {"$set": {"assigned_shop_ids": list(assigned)}},
    )

    return {"message": "Shopkeeper assigned"}


# =========================
# LIST ASSIGNMENTS
# =========================
@router.get("/shops/{shop_id}/assignments")
def list_assignments(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    users = list(
        db.users.find(
            {"assigned_shop_ids": shop_id},
            {"password": 0, "password_hash": 0},
        )
    )

    return [_normalize_id(u) for u in users]


# =========================
# UNASSIGN SHOPKEEPER
# =========================
@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}/unassign")
def unassign_shopkeeper(
    shop_id: str,
    shopkeeper_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    result = db.users.update_one(
        {"_id": shopkeeper_id},
        {"$pull": {"assigned_shop_ids": shop_id}},
    )

    if result.matched_count == 0:
        return {"message": "Shopkeeper already removed"}

    return {"message": "Shopkeeper unassigned successfully"}
    
@router.get("/sales")
def get_sales(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()

    # basic owner scope filter
    if user["role"] in {"owner", "partner"}:
        shops = db.shops.find({"owner_id": user["_id"]})
        shop_ids = [s["_id"] for s in shops]
        query = {"shop_id": {"$in": shop_ids}}
    else:
        query = {}

    sales = list(db.sales.find(query))

    return sales
