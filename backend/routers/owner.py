from fastapi import APIRouter, Depends, HTTPException, Body
from backend.core.deps import require_roles
from backend.db.mongo import get_db
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/owner", tags=["owner"])


def _is_owner_scope(user: dict, shop: dict) -> bool:
    if user["role"] == "admin":
        return True
    return shop.get("owner_id") == user["_id"]


def _normalize_id(doc: dict):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def check_shop_access(shop_id: str):
    db = get_db()
    sub = db.subscriptions.find_one({"shop_id": shop_id})
    if not sub:
        raise HTTPException(status_code=403, detail="No subscription")

    now = datetime.utcnow()
    if sub.get("plan") == "trial_pos":
        if sub.get("trial_end") and sub["trial_end"] > now:
            return {"pos": True, "online": False, "trial": True}
        raise HTTPException(status_code=403, detail="Trial expired. Please subscribe.")

    if sub.get("is_paid"):
        if sub.get("plan") == "pos":
            return {"pos": True, "online": False}
        if sub.get("plan") == "pos_online":
            return {"pos": True, "online": True}

    raise HTTPException(status_code=403, detail="Subscription inactive")


@router.get("/shops")
def list_owner_shops(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    query = {"owner_id": user["_id"]} if user["role"] in {"owner", "partner"} else {}
    shops = list(db.shops.find(query))
    return [_normalize_id(s) for s in shops]


@router.post("/shops")
def create_owner_shop(payload: dict = Body(...), user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    shop_id = str(uuid.uuid4())
    shop_doc = {
        "_id": shop_id,
        "name": name,
        "owner_id": user["_id"],
        "subscription_plan": "trial_pos",
        "online_enabled": False,
        "category": payload.get("category"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "address": payload.get("address"),
    }
    db.shops.insert_one(shop_doc)

    trial_end = datetime.utcnow() + timedelta(days=14)
    db.subscriptions.update_one({"shop_id": shop_id}, {"$set": {"shop_id": shop_id, "plan": "trial_pos", "status": "active", "trial_end": trial_end, "is_paid": False}}, upsert=True)

    return {"message": "Shop created with 14-day POS trial", "shop": _normalize_id(shop_doc)}


@router.post("/shops/{shop_id}/subscribe")
def subscribe_shop(shop_id: str, payload: dict = Body(...), user=Depends(require_roles("owner", "admin"))):
    db = get_db()
    plan = payload.get("plan")
    if plan not in {"pos", "pos_online"}:
        raise HTTPException(status_code=400, detail="Invalid plan")

    if user["role"] != "admin":
        shop = db.shops.find_one({"_id": shop_id, "owner_id": user["_id"]})
        if not shop:
            raise HTTPException(status_code=403, detail="Not allowed")

    db.subscriptions.update_one({"shop_id": shop_id}, {"$set": {"plan": plan, "is_paid": True, "status": "active"}})
    return {"message": f"Subscribed to {plan}"}


@router.delete("/shops/{shop_id}")
def delete_shop(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        return {"message": "Shop already deleted"}
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    db.assignments.delete_many({"shop_id": shop_id})
    db.shops.delete_one({"_id": shop_id})
    db.subscriptions.delete_one({"shop_id": shop_id})
    return {"message": "Shop deleted successfully"}


@router.get("/shopkeepers")
def list_shopkeepers(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] == "admin":
        users = list(db.users.find({"role": "shopkeeper"}, {"password": 0, "password_hash": 0}))
        return [_normalize_id(u) for u in users]

    owner_shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
    assigned_ids = db.assignments.distinct("shopkeeper_id", {"shop_id": {"$in": owner_shop_ids}})
    created_ids = [u["_id"] for u in db.users.find({"role": "shopkeeper", "created_by_owner_id": user["_id"]}, {"_id": 1})]
    ids = list({*assigned_ids, *created_ids})
    users = list(db.users.find({"_id": {"$in": ids}, "role": "shopkeeper"}, {"password": 0, "password_hash": 0}))
    return [_normalize_id(u) for u in users]


@router.post("/shopkeepers")
def create_shopkeeper(payload: dict = Body(...), user=Depends(require_roles("owner", "admin", "partner"))):
    """Owner-scoped shopkeeper creation. Tags the new shopkeeper with created_by_owner_id
    so the owner can see them in the Shopkeepers list and assign them to shops."""
    from backend.core.security import hash_password
    db = get_db()

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    full_name = (payload.get("full_name") or "").strip()

    if not email or not password or not full_name:
        raise HTTPException(status_code=400, detail="full_name, email and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    shopkeeper_id = str(uuid.uuid4())
    doc = {
        "_id": shopkeeper_id,
        "email": email,
        "password_hash": hash_password(password),
        "full_name": full_name,
        "role": "shopkeeper",
        "assigned_shop_ids": [],
        "created_by_owner_id": user["_id"] if user["role"] in {"owner", "partner"} else None,
        "created_at": datetime.utcnow().isoformat(),
    }
    db.users.insert_one(doc)
    return {
        "message": "Shopkeeper created",
        "shopkeeper": {
            "_id": shopkeeper_id,
            "email": email,
            "full_name": full_name,
            "role": "shopkeeper",
        },
    }


@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}")
def assign_shopkeeper(shop_id: str, shopkeeper_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    staff = db.users.find_one({"_id": shopkeeper_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    existing = db.assignments.find_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id})
    if not existing:
        db.assignments.insert_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id, "owner_id": shop["owner_id"], "created_at": datetime.utcnow().isoformat()})
    return {"message": "Shopkeeper assigned"}


@router.get("/shops/{shop_id}/assignments")
def list_assignments(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    raw = list(db.assignments.find({"shop_id": shop_id}, {"_id": 0, "shopkeeper_id": 1, "shop_id": 1}))
    sk_ids = [a["shopkeeper_id"] for a in raw]
    users = {u["_id"]: u for u in db.users.find(
        {"_id": {"$in": sk_ids}, "role": "shopkeeper"},
        {"password": 0, "password_hash": 0},
    )}
    assignments = []
    for a in raw:
        u = users.get(a["shopkeeper_id"], {})
        assignments.append({
            "shop_id": a["shop_id"],
            "shopkeeper_id": a["shopkeeper_id"],
            "shopkeeper_name": u.get("full_name") or u.get("name") or "",
            "shopkeeper_email": u.get("email") or "",
        })
    return {"assignments": assignments}


@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}/unassign")
def unassign_shopkeeper(shop_id: str, shopkeeper_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    db.assignments.delete_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id})
    return {"message": "Shopkeeper unassigned successfully"}


@router.get("/sales")
def get_sales(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
        query = {"shop_id": {"$in": shop_ids}}
    else:
        query = {}
    return list(db.sales.find(query))
