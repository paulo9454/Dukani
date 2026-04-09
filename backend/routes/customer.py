from fastapi import APIRouter, Depends, HTTPException, Header
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.schemas.order import CartItemInput, CheckoutRequest
from backend.services.checkout import checkout_customer
from backend.services.audit import audit_log
import uuid

router = APIRouter(prefix="/api/customer", tags=["customer"])


@router.get("/cart")
def get_cart(user=Depends(require_roles("customer"))):
    db = get_db()
    cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
    cart.pop("_id", None)
    return cart


@router.post("/cart")
def add_to_cart(item: CartItemInput, user=Depends(require_roles("customer"))):
    db = get_db()
    product = db.products.find_one({"_id": item.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
    shop_ids = {i["shop_id"] for i in cart["items"]}
    if shop_ids and product["shop_id"] not in shop_ids:
        raise HTTPException(status_code=400, detail="Single-shop cart constraint")

    updated = False
    for it in cart["items"]:
        if it["product_id"] == item.product_id:
            it["qty"] = item.qty
            updated = True
            break
    if not updated:
        cart["items"].append({"product_id": item.product_id, "qty": item.qty, "shop_id": product["shop_id"]})

    db.carts.update_one({"customer_id": user["_id"]}, {"$set": cart}, upsert=True)
    cart.pop("_id", None)
    return cart


@router.delete("/cart/{product_id}")
def remove_from_cart(product_id: str, user=Depends(require_roles("customer"))):
    db = get_db()
    cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
    cart["items"] = [i for i in cart["items"] if i["product_id"] != product_id]
    db.carts.update_one({"customer_id": user["_id"]}, {"$set": cart}, upsert=True)
    cart.pop("_id", None)
    return cart


@router.post("/checkout")
def checkout(
    payload: CheckoutRequest,
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(require_roles("customer")),
):
    idempotency_key = idempotency_key_header or payload.idempotency_key or str(uuid.uuid4())
    result = checkout_customer(
        user,
        payload.payment_provider,
        idempotency_key,
        payload.payment_method,
        payload.payment_meta,
    )
    audit_log("customer_checkout_request", actor_id=user["_id"], metadata={"idempotency_key": idempotency_key})
    return result
