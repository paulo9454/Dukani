from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db

router = APIRouter(prefix="/api/shop", tags=["shop"])


# =========================
# 🏪 GET SHOP SETTINGS
# =========================
@router.get("/{shop_id}/online-settings")
def get_online_settings(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    return {
        "shop_id": shop_id,
        "online_enabled": shop.get("online_enabled", False),
        "category": shop.get("category"),
    }


# =========================
# 🚀 UPDATE ONLINE SETTINGS (FIXED)
# =========================
@router.put("/{shop_id}/online-settings")
def update_online_settings(
    shop_id: str,
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    db = get_db()

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # =========================
    # ROLE CONTROL
    # =========================
    if user.get("role") == "shopkeeper":
        if shop_id not in user.get("assigned_shop_ids", []):
            raise HTTPException(status_code=403, detail="Not allowed for this shop")

    online_enabled = payload.get("online_enabled", False)
    category = payload.get("category")

    # =========================
    # VALIDATION (STRICT FIX)
    # =========================
    if online_enabled is True:
        if not category:
            raise HTTPException(
                status_code=400,
                detail="Category is required to activate online shop",
            )

        product_count = db.products.count_documents({
            "shop_id": shop_id,
            "is_public": True,
        })

        if product_count <= 0:
            raise HTTPException(
                status_code=400,
                detail="Add at least one public product before going online",
            )

    # =========================
    # BUILD UPDATE SAFE
    # =========================
    update_data = {
        "online_enabled": bool(online_enabled),
    }

    # IMPORTANT: always enforce category when activating online
    if online_enabled is True:
        update_data["category"] = category

    elif category is not None:
        # allow category updates even if offline
        update_data["category"] = category

    db.shops.update_one(
        {"_id": shop_id},
        {"$set": update_data},
    )

    return {
        "message": "Shop online settings updated",
        "shop_id": shop_id,
        "online_enabled": update_data["online_enabled"],
        "category": update_data.get("category", shop.get("category")),
    }
