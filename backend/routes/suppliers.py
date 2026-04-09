from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from datetime import datetime, timezone
import uuid
from backend.services.audit import audit_log

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.post("")
def create_supplier(payload: dict, user=Depends(require_roles("owner"))):
    db = get_db()
    doc = {
        "_id": str(uuid.uuid4()),
        "name": payload["name"],
        "owner_id": user["_id"],
        "contact": payload.get("contact"),
        "product_ids": payload.get("product_ids", []),
        "history": [{"event": "created", "at": datetime.now(timezone.utc).isoformat()}],
    }
    db.suppliers.insert_one(doc)
    audit_log("supplier_create", actor_id=user["_id"], metadata={"supplier_id": doc["_id"]})
    return doc


@router.put("/{supplier_id}/link-product/{product_id}")
def link_supplier_product(supplier_id: str, product_id: str, user=Depends(require_roles("owner"))):
    db = get_db()
    supplier = db.suppliers.find_one({"_id": supplier_id, "owner_id": user["_id"]})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    product = db.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    ids = list(set(supplier.get("product_ids", []) + [product_id]))
    history = supplier.get("history", []) + [{"event": "linked_product", "product_id": product_id, "at": datetime.now(timezone.utc).isoformat()}]
    db.suppliers.update_one({"_id": supplier_id}, {"$set": {"product_ids": ids, "history": history}})
    audit_log("supplier_link_product", actor_id=user["_id"], metadata={"supplier_id": supplier_id, "product_id": product_id})
    return db.suppliers.find_one({"_id": supplier_id})


@router.get("")
def list_suppliers(user=Depends(require_roles("owner"))):
    db = get_db()
    return list(db.suppliers.find({"owner_id": user["_id"]}))
