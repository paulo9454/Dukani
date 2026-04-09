from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from datetime import datetime, timezone
import uuid
from backend.services.audit import audit_log

router = APIRouter(prefix="/api/damaged-stock", tags=["inventory"])


@router.post("")
def create_damage(payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    product_id = payload.get("product_id")
    qty = int(payload.get("qty", 0))
    reason = payload.get("reason", "unspecified")

    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if user["role"] == "shopkeeper" and product["shop_id"] not in user.get("assigned_shop_ids", []):
        raise HTTPException(status_code=403, detail="Shopkeeper not assigned")
    if qty <= 0 or qty > product.get("stock", 0):
        raise HTTPException(status_code=400, detail="Invalid damage quantity")

    db.products.update_one({"_id": product_id}, {"$inc": {"stock": -qty}})
    doc = {
        "_id": str(uuid.uuid4()),
        "product_id": product_id,
        "shop_id": product["shop_id"],
        "qty": qty,
        "unit_price": product["price"],
        "loss_value": round(product["price"] * qty, 2),
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["_id"],
    }
    db.damaged_stock.insert_one(doc)
    audit_log("damaged_stock", actor_id=user["_id"], metadata={"product_id": product_id, "qty": qty})
    return doc


@router.get("")
def list_damage(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        return list(db.damaged_stock.find({"shop_id": {"$in": user.get("assigned_shop_ids", [])}}))
    return list(db.damaged_stock.find({}))
