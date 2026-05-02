from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
import uuid

router = APIRouter(prefix="/api/categories", tags=["categories"])


from fastapi import Query

@router.get("")
def list_categories(
    shop_id: str = Query(None),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))
):
    db = get_db()

    # 🔒 keep security (optional now since categories are global)
    if user["role"] == "shopkeeper":
        if shop_id and shop_id not in user.get("assigned_shop_ids", []):
            raise HTTPException(status_code=403, detail="Not allowed")

    # ✅ GLOBAL CATEGORIES (IMPORTANT FIX)
    categories = list(db.categories.find({}))

    for c in categories:
        c["_id"] = str(c["_id"])

    return categories

@router.post("")
def create_category(
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner"))
):
    db = get_db()

    shop_id = payload.get("shop_id")
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    category = {
        "_id": str(uuid.uuid4()),
        "name": payload.get("name"),
        "icon": payload.get("icon", "📦"),
        "type": payload.get("type", "both")
    }

    db.categories.insert_one(category)
    return category
