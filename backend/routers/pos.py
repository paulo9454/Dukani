from fastapi import APIRouter, Depends, HTTPException, Header, Query
from backend.core.deps import get_current_user, require_roles
from backend.db.mongo import get_db
from backend.schemas.order import CartItemInput, CheckoutRequest, POSCheckoutRequest
from backend.services.checkout import checkout_customer, checkout_pos
from backend.services.audit import audit_log
from backend.services.safe_query import safe_str
import uuid

router = APIRouter(tags=["pos"])


def _resolve_assigned_shop(user: dict, requested_shop_id: str | None = None) -> str:
    assigned = user.get("assigned_shop_ids", [])
    if user.get("role") != "shopkeeper":
        return requested_shop_id or ""

    if not assigned:
        raise HTTPException(status_code=403, detail="No shop assignment found")

    if requested_shop_id and requested_shop_id not in assigned:
        raise HTTPException(status_code=403, detail="Shopkeeper cannot switch shops")

    if requested_shop_id:
        return requested_shop_id

    return assigned[0]


@router.get("/api/products")
def list_products(
    q: str | None = Query(default=None),
    barcode: str | None = Query(default=None),
    shop_id: str | None = Query(default=None),
    user=Depends(get_current_user),
):
    if user.get("role") == "customer":
        raise HTTPException(status_code=403, detail="Customers must use /api/public/products")

    db = get_db()
    effective_shop_id = _resolve_assigned_shop(user, shop_id)

    if user.get("role") in {"owner", "admin", "partner"} and not effective_shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")

    filters = {"shop_id": effective_shop_id} if effective_shop_id else {}
    if barcode:
        filters["barcode"] = safe_str(barcode, "barcode")
    if q:
        q = safe_str(q, "q")
        filters["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    return list(db.products.find(filters))


@router.post("/api/products")
def create_product(payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    shop_id = payload.get("shop_id")
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")
    if user.get("role") == "shopkeeper":
        shop_id = _resolve_assigned_shop(user, shop_id)
    payload["shop_id"] = shop_id
    payload["_id"] = str(uuid.uuid4())
    db.products.insert_one(payload)
    return payload


@router.get("/api/customer/cart")
def get_cart(shop_id: str | None = Query(default=None), user=Depends(require_roles("customer", "shopkeeper"))):
    db = get_db()
    if user["role"] == "customer":
        cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
        return {"customer_id": cart["customer_id"], "items": [{"product_id": i["product_id"], "qty": i["qty"]} for i in cart.get("items", [])]}

    locked_shop = _resolve_assigned_shop(user, shop_id)
    cart = db.pos_carts.find_one({"operator_id": user["_id"], "shop_id": locked_shop}) or {
        "operator_id": user["_id"], "shop_id": locked_shop, "items": []
    }
    return {"shop_id": locked_shop, "items": cart.get("items", [])}


@router.post("/api/customer/cart")
def add_to_cart(item: CartItemInput, shop_id: str | None = Query(default=None), user=Depends(require_roles("customer", "shopkeeper"))):
    db = get_db()
    product = db.products.find_one({"_id": item.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if user["role"] == "customer":
        cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
        shop_ids = {i["shop_id"] for i in cart["items"]}
        if shop_ids and product["shop_id"] not in shop_ids:
            raise HTTPException(status_code=400, detail="Single-shop cart constraint")

        for existing in cart["items"]:
            if existing["product_id"] == item.product_id:
                existing["qty"] = item.qty
                break
        else:
            cart["items"].append({"product_id": item.product_id, "qty": item.qty, "shop_id": product["shop_id"]})

        db.carts.update_one({"customer_id": user["_id"]}, {"$set": cart}, upsert=True)
        return {"customer_id": cart["customer_id"], "items": [{"product_id": i["product_id"], "qty": i["qty"]} for i in cart["items"]]}

    locked_shop = _resolve_assigned_shop(user, shop_id)
    if product.get("shop_id") != locked_shop:
        raise HTTPException(status_code=403, detail="Cannot add products from another shop")

    cart = db.pos_carts.find_one({"operator_id": user["_id"], "shop_id": locked_shop}) or {
        "operator_id": user["_id"], "shop_id": locked_shop, "items": []
    }
    for existing in cart["items"]:
        if existing["product_id"] == item.product_id:
            existing["qty"] = item.qty
            break
    else:
        cart["items"].append({"product_id": item.product_id, "qty": item.qty})

    db.pos_carts.update_one({"operator_id": user["_id"], "shop_id": locked_shop}, {"$set": cart}, upsert=True)
    return {"shop_id": locked_shop, "items": cart["items"]}


@router.delete("/api/customer/cart/{product_id}")
def remove_from_cart(product_id: str, shop_id: str | None = Query(default=None), user=Depends(require_roles("customer", "shopkeeper"))):
    db = get_db()
    if user["role"] == "customer":
        cart = db.carts.find_one({"customer_id": user["_id"]}) or {"customer_id": user["_id"], "items": []}
        cart["items"] = [i for i in cart["items"] if i["product_id"] != product_id]
        db.carts.update_one({"customer_id": user["_id"]}, {"$set": cart}, upsert=True)
        return {"customer_id": cart["customer_id"], "items": [{"product_id": i["product_id"], "qty": i["qty"]} for i in cart["items"]]}

    locked_shop = _resolve_assigned_shop(user, shop_id)
    cart = db.pos_carts.find_one({"operator_id": user["_id"], "shop_id": locked_shop}) or {
        "operator_id": user["_id"], "shop_id": locked_shop, "items": []
    }
    cart["items"] = [i for i in cart["items"] if i["product_id"] != product_id]
    db.pos_carts.update_one({"operator_id": user["_id"], "shop_id": locked_shop}, {"$set": cart}, upsert=True)
    return {"shop_id": locked_shop, "items": cart["items"]}


@router.post("/api/customer/checkout")
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


@router.get("/api/orders")
def list_orders(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    db = get_db()
    if user["role"] == "shopkeeper":
        locked_shop = _resolve_assigned_shop(user)
        return list(db.orders.find({"shop_id": locked_shop}))
    return list(db.orders.find({}))


@router.get("/api/customer/orders")
def list_customer_orders(user=Depends(require_roles("customer"))):
    db = get_db()
    return list(db.orders.find({"customer_id": user["_id"]}))


@router.post("/api/orders/checkout")
def pos_checkout(
    payload: POSCheckoutRequest,
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(require_roles("owner", "admin", "partner", "shopkeeper")),
):
    idempotency_key = idempotency_key_header or payload.idempotency_key or str(uuid.uuid4())
    effective_shop_id = _resolve_assigned_shop(user, payload.shop_id)
    result = checkout_pos(
        user,
        effective_shop_id,
        [i.model_dump() for i in payload.items],
        payload.payment_provider,
        idempotency_key,
        payload.payment_method,
        payload.discount,
        payload.tax_percent,
        payload.payment_meta,
    )
    audit_log("pos_checkout_request", actor_id=user["_id"], metadata={"idempotency_key": idempotency_key, "shop_id": effective_shop_id})
    return result
