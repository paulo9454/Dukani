from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.schemas.shop import ShopCreateRequest
import uuid

router = APIRouter(prefix="/api/owner", tags=["owner"])


# =========================
# HELPERS
# =========================
def _is_owner_scope(user: dict, shop: dict) -> bool:
    if user["role"] in {"admin"}:
        return True
    return shop.get("owner_id") == user["_id"]


def _normalize_id(doc: dict):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# =========================
# LIST OWNER SHOPS
# =========================
@router.get("/shops")
def list_owner_shops(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()

    query = (
        {"owner_id": user["_id"]}
        if user["role"] in {"owner", "partner"}
        else {}
    )

    shops = list(db.shops.find(query))
    return [_normalize_id(s) for s in shops]


# =========================
# CREATE SHOP
# =========================
@router.post("/shops")
def create_owner_shop(
    payload: ShopCreateRequest,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    name = payload.name.strip()
    subscription_plan = payload.subscription_plan

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    shop_id = str(uuid.uuid4())

    shop_doc = {
        "_id": shop_id,
        "name": name,
        "owner_id": user["_id"],
        "subscription_plan": subscription_plan,
        "online_enabled": False,
        "category": None,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "address": payload.address,
    }

    db.shops.insert_one(shop_doc)

    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {
            "$set": {
                "shop_id": shop_id,
                "plan": subscription_plan,
                "status": "active",
            }
        },
        upsert=True,
    )

    return shop_doc


# =========================
# SHOPKEEPERS
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
        raise HTTPException(status_code=403, detail="Not allowed for this shop")

    staff = db.users.find_one({"_id": shopkeeper_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    assigned = set(staff.get("assigned_shop_ids", []))
    assigned.add(shop_id)

    assigned_list = list(assigned)

    db.users.update_one(
        {"_id": shopkeeper_id},
        {"$set": {"assigned_shop_ids": assigned_list}},
    )

    return {
        "shop_id": shop_id,
        "shopkeeper_id": shopkeeper_id,
        "assigned_shop_ids": assigned_list,
    }


# =========================
# SHOP ASSIGNMENTS
# =========================
@router.get("/shops/{shop_id}/assignments")
def get_shop_assignments(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    users = list(
        db.users.find(
            {"role": "shopkeeper", "assigned_shop_ids": shop_id},
            {"password": 0, "password_hash": 0},
        )
    )

    return {
        "shop_id": shop_id,
        "assignments": [_normalize_id(u) for u in users],
    }


# =========================
# SALES DASHBOARD
# =========================
@router.get("/sales")
def owner_sales(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()

    if user["role"] in {"owner", "partner"}:
        shop_ids = [
            s["_id"]
            for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})
        ]
    else:
        shop_ids = [s["_id"] for s in db.shops.find({}, {"_id": 1})]

    if not shop_ids:
        return {
            "revenue": 0,
            "orders": 0,
            "avg_order": 0,
            "shops": [],
            "recent": [],
        }

    orders = list(
        db.orders.find(
            {
                "shop_id": {"$in": shop_ids},
                "status": "paid",
            }
        )
    )

    revenue = sum(float(o.get("total", 0)) for o in orders)

    shop_map = {}
    for o in orders:
        sid = o.get("shop_id")
        if not sid:
            continue

        shop_map.setdefault(
            sid,
            {"shop_id": sid, "revenue": 0.0, "orders": 0},
        )

        shop_map[sid]["revenue"] += float(o.get("total", 0))
        shop_map[sid]["orders"] += 1

    recent = sorted(
        orders,
        key=lambda x: x.get("created_at", ""),
        reverse=True,
    )[:10]

    return {
        "revenue": round(revenue, 2),
        "orders": len(orders),
        "avg_order": round(revenue / len(orders), 2) if orders else 0,
        "shops": list(shop_map.values()),
        "recent": [_normalize_id(o) for o in recent],
    }


# =========================
# POS ACCESS
# =========================
@router.get("/shops/{shop_id}/pos-access")
def owner_pos_access(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    return {
        "shop_id": shop_id,
        "pos_path": f"/apps/pos?shop_id={shop_id}",
    }
