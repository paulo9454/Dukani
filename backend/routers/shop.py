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


# =========================
# 💳 GET M-PESA SETTINGS  (owner only, secrets masked)
# =========================
def _mask(value: str | None) -> str:
    if not value:
        return ""
    s = str(value)
    if len(s) <= 4:
        return "*" * len(s)
    return s[:2] + "•" * (len(s) - 4) + s[-2:]


@router.get("/{shop_id}/mpesa-settings")
def get_mpesa_settings(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    shop = get_shop(db, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    assert_shop_access(user, shop)

    return {
        "shop_id": shop_id,
        "mpesa_configured": bool(
            shop.get("mpesa_consumer_key")
            and shop.get("mpesa_consumer_secret")
            and shop.get("mpesa_shortcode")
            and shop.get("mpesa_passkey")
        ),
        "mpesa_shortcode": shop.get("mpesa_shortcode", ""),
        "mpesa_business_name": shop.get("mpesa_business_name", ""),
        "mpesa_env": shop.get("mpesa_env", "sandbox"),
        # Manual fallback fields (safe to echo back in full — these are
        # meant to be visible to the public on the shop page).
        "mpesa_till_number": shop.get("mpesa_till_number", ""),
        "mpesa_paybill_number": shop.get("mpesa_paybill_number", ""),
        "mpesa_account_name": shop.get("mpesa_account_name", ""),
        # Sensitive fields are never returned in full — only masked preview.
        "mpesa_consumer_key_masked": _mask(shop.get("mpesa_consumer_key")),
        "mpesa_consumer_secret_masked": _mask(shop.get("mpesa_consumer_secret")),
        "mpesa_passkey_masked": _mask(shop.get("mpesa_passkey")),
    }


@router.put("/{shop_id}/mpesa-settings")
def update_mpesa_settings(
    shop_id: str,
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    shop = get_shop(db, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    assert_shop_access(user, shop)

    # Only update fields that were actually sent so an empty input doesn't
    # wipe a previously-saved value.
    updates: dict = {}
    for k in (
        "mpesa_consumer_key",
        "mpesa_consumer_secret",
        "mpesa_shortcode",
        "mpesa_passkey",
        "mpesa_business_name",
        "mpesa_env",
        "mpesa_till_number",
        "mpesa_paybill_number",
        "mpesa_account_name",
    ):
        v = payload.get(k)
        if v is not None and str(v).strip():
            updates[k] = str(v).strip()

    if updates.get("mpesa_env") and updates["mpesa_env"] not in {"sandbox", "production"}:
        raise HTTPException(status_code=400, detail="mpesa_env must be 'sandbox' or 'production'")

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    db.shops.update_one({"_id": shop_id}, {"$set": updates})
    return {"ok": True, "updated_fields": sorted(updates.keys())}


@router.post("/{shop_id}/mpesa-settings/test")
def test_mpesa_stk_push(
    shop_id: str,
    payload: dict,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    """Fire a KES 1 sandbox/production STK push using the shop's saved
    Daraja credentials. No order is created and no stock is touched — this
    is purely a credential-verification tool for the owner."""
    from backend.routers.payments import _mpesa_cfg, _mpesa_cfg_complete, _stk_push

    phone = (payload.get("phone") or "").strip().replace(" ", "").replace("-", "")
    if not phone or len(phone) < 9:
        raise HTTPException(status_code=400, detail="Valid phone number is required")

    db = get_db()
    shop = get_shop(db, shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    assert_shop_access(user, shop)

    cfg = _mpesa_cfg(shop)
    if not _mpesa_cfg_complete(cfg):
        raise HTTPException(
            status_code=400,
            detail="Save your consumer key, consumer secret, shortcode and passkey first.",
        )

    checkout_request_id, daraja_response = _stk_push(
        cfg=cfg,
        order_id=None,
        amount=1,  # KES 1 — Daraja minimum for verification
        phone=phone,
    )

    # Detect clearly-failed Daraja responses so we surface the error.
    response_code = None
    error_message = None
    if isinstance(daraja_response, dict):
        response_code = daraja_response.get("ResponseCode") or daraja_response.get("errorCode")
        error_message = daraja_response.get("errorMessage") or daraja_response.get("ResponseDescription")

    if daraja_response is None:
        # Nothing returned → token/auth failed (usually wrong keys or env)
        raise HTTPException(
            status_code=502,
            detail=(
                "Daraja did not accept the credentials. Double-check your consumer key, "
                "consumer secret, shortcode, passkey and environment (sandbox vs production)."
            ),
        )
    if response_code and str(response_code) not in {"0", "00000000"}:
        raise HTTPException(
            status_code=502,
            detail=f"Daraja error: {error_message or response_code}",
        )

    return {
        "ok": True,
        "reference": checkout_request_id,
        "amount": 1,
        "phone": phone,
        "env": cfg["env"],
        "message": "Test prompt sent. Check your phone — KES 1 only, enter PIN to verify keys.",
    }
