from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/shop", tags=["shop"])


# =========================
# 🔐 GET SHOP (SAFE)
# =========================
def get_shop(db, shop_id: str):
    return db.shops.find_one({"_id": shop_id})


def assert_shop_access(user, shop):
    if user["role"] == "admin":
        return

    if shop["owner_id"] == user["_id"]:
        return

    # shopkeeper access MUST be validated via assignments collection (not user field)
    if user["role"] == "shopkeeper":
        db = get_db()
        assigned = db.assignments.find_one({
            "shop_id": shop["_id"],
            "shopkeeper_id": user["_id"]
        })
        if assigned:
            return

    raise HTTPException(status_code=403, detail="Not allowed")


# =========================
# 🏪 GET SHOP SETTINGS
# =========================
@router.get("/{shop_id}/online-settings")
def get_online_settings(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop = get_shop(db, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    assert_shop_access(user, shop)

    return {
        "shop_id": shop_id,
        "online_enabled": shop.get("online_enabled", False),
        "category": shop.get("category"),
    }


# =========================
# 🚀 UPDATE SHOP SETTINGS
# =========================
@router.put("/{shop_id}/online-settings")
def update_online_settings(
    shop_id: str,
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop = get_shop(db, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    assert_shop_access(user, shop)

    online_enabled = payload.get("online_enabled", False)
    category = payload.get("category")

    if online_enabled and not category:
        raise HTTPException(
            status_code=400,
            detail="Category is required",
        )

    if online_enabled:
        product_count = db.products.count_documents({
            "shop_id": shop_id,
            "is_public": True,
            "owner_id": shop["owner_id"]
        })

        if product_count <= 0:
            raise HTTPException(
                status_code=400,
                detail="Add at least one public product before going online",
            )

    update_data = {
        "online_enabled": bool(online_enabled),
    }

    if category is not None:
        update_data["category"] = category

    db.shops.update_one(
        {"_id": shop_id, "owner_id": shop["owner_id"]},
        {"$set": update_data},
    )

    return {
        "message": "Shop updated",
        "shop_id": shop_id,
        "online_enabled": update_data["online_enabled"],
        "category": update_data.get("category"),
    }


# =========================
# 🏪 GET MY SHOPS (CLEAN TENANT RULE)
# =========================
@router.get("/my")
def get_my_shops(
    user=Depends(require_roles("shopkeeper", "owner", "admin", "partner")),
):
    db = get_db()

    # ADMIN
    if user["role"] == "admin":
        shops = list(db.shops.find({}))
        return [{**s, "_id": str(s["_id"])} for s in shops]

    # OWNER / PARTNER
    if user["role"] in {"owner", "partner"}:
        shops = list(db.shops.find({"owner_id": user["_id"]}))
        return [{**s, "_id": str(s["_id"])} for s in shops]

    # SHOPKEEPER → ONLY via assignments collection (NO user field dependency)
    assigned = db.assignments.find({"shopkeeper_id": user["_id"]})
    shop_ids = [a["shop_id"] for a in assigned]

    if not shop_ids:
        return []

    shops = list(db.shops.find({"_id": {"$in": shop_ids}}))

    return [{**s, "_id": str(s["_id"])} for s in shops]
