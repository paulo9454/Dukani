from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.schemas.order import CartItemInput

router = APIRouter(prefix="/api/customer", tags=["customer"])


# =========================
# 🛒 GET CART (CLEAN OUTPUT)
# =========================
@router.get("/cart")
def get_cart(user=Depends(require_roles("customer"))):
    db = get_db()

    cart = db.carts.find_one({"customer_id": user["_id"]}) or {
        "customer_id": user["_id"],
        "items": []
    }

    return {
        "customer_id": cart["customer_id"],
        "items": [
            {
                "product_id": i["product_id"],
                "qty": i["qty"],
                "shop_id": i.get("shop_id")
            }
            for i in cart.get("items", [])
        ]
    }


# =========================
# 🛒 ADD TO CART (SAFE + CONSISTENT)
# =========================
@router.post("/cart")
def add_to_cart(item: CartItemInput, user=Depends(require_roles("customer"))):
    db = get_db()

    product = db.products.find_one({"_id": item.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.get("stock", 0) < item.qty:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    cart = db.carts.find_one({"customer_id": user["_id"]})

    if not cart:
        cart = {"customer_id": user["_id"], "items": []}

    # enforce single-shop rule
    if cart["items"]:
        existing_shop = cart["items"][0].get("shop_id")
        if existing_shop and existing_shop != product["shop_id"]:
            raise HTTPException(status_code=400, detail="Single-shop cart only")

    updated = False

    for i in cart["items"]:
        if i["product_id"] == item.product_id:
            i["qty"] = item.qty
            updated = True
            break

    if not updated:
        cart["items"].append({
            "product_id": item.product_id,
            "qty": item.qty,
            "shop_id": product["shop_id"]
        })

    db.carts.update_one(
        {"customer_id": user["_id"]},
        {"$set": {
            "customer_id": user["_id"],
            "items": cart["items"]
        }},
        upsert=True
    )

    return {
        "customer_id": user["_id"],
        "items": cart["items"]
    }


# =========================
# 🗑 REMOVE FROM CART
# =========================
@router.delete("/cart/{product_id}")
def remove_from_cart(product_id: str, user=Depends(require_roles("customer"))):
    db = get_db()

    cart = db.carts.find_one({"customer_id": user["_id"]}) or {
        "customer_id": user["_id"],
        "items": []
    }

    cart["items"] = [
        i for i in cart["items"]
        if i["product_id"] != product_id
    ]

    db.carts.update_one(
        {"customer_id": user["_id"]},
        {"$set": {
            "customer_id": user["_id"],
            "items": cart["items"]
        }},
        upsert=True
    )

    return {
        "customer_id": user["_id"],
        "items": cart["items"]
    }


# DEPRECATED: checkout is POS-owned at /api/orders/checkout (routers/pos.py).


# =========================
# 📦 ORDERS
# =========================
@router.get("/orders")
def get_orders(user=Depends(require_roles("customer"))):
    db = get_db()
    return list(db.orders.find({"customer_id": user["_id"]}))
