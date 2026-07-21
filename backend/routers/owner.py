from fastapi import APIRouter, Depends, HTTPException, Body
from backend.core.deps import require_roles
from backend.db.mongo import get_db
from backend.services.subscription_service import get_subscription
import os
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/owner", tags=["owner"])


def _is_owner_scope(user: dict, shop: dict) -> bool:
    if user["role"] == "admin":
        return True
    return shop.get("owner_id") == user["_id"]


def _normalize_id(doc: dict):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def check_shop_access(shop_id: str):
    """Deprecated — defer to the canonical implementation in pos.py.

    Kept as a thin re-export so any future caller stays in sync with the
    plan/trial semantics defined alongside checkout.
    """
    from backend.routers.pos import check_shop_access as _csa
    return _csa(shop_id)


@router.get("/shops")
def list_owner_shops(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    query = {"owner_id": user["_id"]} if user["role"] in {"owner", "partner"} else {}
    shops = list(db.shops.find(query))

    normalized = []
    for shop in shops:
        sub = get_subscription(db, shop["_id"])
        shop["subscription_plan"] = sub["plan"]
        shop["subscription_status"] = sub["status"]
        shop["online_enabled"] = bool(sub["features"]["online"])
        shop["is_online_enabled"] = bool(sub["features"]["online"])
        shop["pos_enabled"] = bool(sub["features"]["pos"])
        shop["subscription_days_left"] = sub["days_left"]
        shop["subscription_features"] = sub["features"]
        normalized.append(_normalize_id(shop))

    return normalized


@router.post("/shops")
def create_owner_shop(payload: dict = Body(...), user=Depends(require_roles("owner", "admin", "partner"))):
    from backend.services.slug import slugify, ensure_unique_slug
    db = get_db()
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    shop_id = str(uuid.uuid4())
    slug = ensure_unique_slug(db, slugify(payload.get("slug") or name))
    now = datetime.utcnow()
    trial_end = now + timedelta(days=30)
    shop_doc = {
        "_id": shop_id,
        "name": name,
        "slug": slug,
        "owner_id": user["_id"],
        "subscription_plan": "trial",
        # Trial includes BOTH POS and online so owners can experience the
        # full product before paying.
        "online_enabled": True,
        "is_online_enabled": True,
        "pos_enabled": True,
        "trial_start_at": now.isoformat(),
        "trial_end_at": trial_end.isoformat(),
        "subscription_status": "trial",
        "category": payload.get("category"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "address": payload.get("address"),
        "logo": payload.get("logo"),
        "description": payload.get("description"),
    }
    db.shops.insert_one(shop_doc)

    db.subscriptions.update_one(
        {"shop_id": shop_id},
        {"$set": {
            "shop_id": shop_id,
            "plan": "trial",
            "status": "trial",
            "trial_start": now.isoformat(),
            "trial_end": trial_end.isoformat(),
            "is_paid": False,
        }},
        upsert=True,
    )

    return {"message": "Shop created with 30-day free trial (POS + Online)", "shop": _normalize_id(shop_doc)}


SUBSCRIPTION_PRICES_KES = {
    "pos": 500,
    "pos_online": 1000,
}


@router.post("/shops/{shop_id}/subscribe")
def subscribe_shop(
    shop_id: str,
    payload: dict = Body(...),
    user=Depends(require_roles("owner", "admin")),
):
    """Start a Paystack checkout for a subscription plan.

    Activation NEVER happens here — it's driven exclusively by the
    verified Paystack webhook/verify flow which flips the shop's plan
    only after `charge.success`. This endpoint returns the
    authorization_url the client should redirect to.
    """
    from backend.routers.payments import paystack_initialize

    db = get_db()
    plan = payload.get("plan")
    if plan not in {"pos", "pos_online"}:
        raise HTTPException(status_code=400, detail="Invalid plan")

    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if user["role"] != "admin" and shop.get("owner_id") != user["_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Admin override — admins can set plans without payment (internal tool).
    if user["role"] == "admin" and payload.get("admin_override") is True:
        online = plan == "pos_online"
        db.shops.update_one(
            {"_id": shop_id},
            {"$set": {
                "subscription_plan": plan,
                "online_enabled": online,
                "is_online_enabled": online,
                "subscription_status": "active",
            }},
        )
        db.subscriptions.update_one(
            {"shop_id": shop_id},
            {"$set": {"plan": plan, "is_paid": True, "status": "active"}},
            upsert=True,
        )
        return {"activated": True, "plan": plan, "online_enabled": online, "admin_override": True}

    email = user.get("email") or shop.get("contact_email")
    if not email:
        raise HTTPException(status_code=400, detail="Owner email is required for payment")

    amount = SUBSCRIPTION_PRICES_KES.get(plan)
    base_url = os.getenv("APP_BASE_URL", "").rstrip("/")
    callback_url = payload.get("callback_url") or (
        f"{base_url}/owner?sub=verify" if base_url else None
    )

    init = paystack_initialize(
        payload={
            "email": email,
            "amount": amount,
            "currency": payload.get("currency", "KES"),
            "shop_id": shop_id,
            "subscription_plan": plan,
            "payment_type": "subscription",
            "callback_url": callback_url,
        },
        user=user,
    )

    return {
        "activated": False,
        "plan": plan,
        "amount": amount,
        "currency": "KES",
        "authorization_url": init.get("authorization_url"),
        "reference": init.get("reference"),
        "public_key": init.get("public_key"),
        "message": "Complete payment to activate this plan.",
    }


# =========================================================
# 🛟 OWNER — RECOVER STUCK ONLINE ACTIVATION
# Used when a shop owner says "I paid but my shop link still
# says 'not currently selling online'". Verifies the latest
# successful Paystack subscription payment for the shop and
# re-runs activation. Optionally accepts an explicit Paystack
# reference for surgical recovery.
# =========================================================
@router.post("/shops/{shop_id}/recover-activation")
def recover_activation(
    shop_id: str,
    payload: dict = Body(default={}),
    user=Depends(require_roles("owner", "admin", "partner")),
):
    from backend.routers.payments import _activate_subscription, paystack_verify

    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    reference = (payload.get("paystack_reference") or "").strip() or None

    # 1. Pick the candidate payment record.
    candidate = None
    if reference:
        candidate = db.payments.find_one({"reference": reference, "shop_id": shop_id})
        if not candidate:
            # Maybe the reference matches but shop_id wasn't persisted on the
            # payment row — accept it anyway if status is success.
            candidate = db.payments.find_one({"reference": reference})
    else:
        candidate = db.payments.find_one(
            {
                "shop_id": shop_id,
                "provider": "paystack",
                "subscription_plan": "pos_online",
                "status": "success",
            },
            sort=[("created_at", -1)],
        )

    # 2. If no record, hit Paystack verify directly when a reference was given.
    if not candidate and reference:
        try:
            verified = paystack_verify(reference=reference, payload=None, user=user)
        except Exception:
            verified = None
        if verified and verified.get("verified"):
            # paystack_verify upserts a payment row already; refetch & patch
            # missing shop/plan metadata so _activate_subscription can run.
            candidate = db.payments.find_one({"reference": reference})
            if candidate:
                patch = {}
                if not candidate.get("shop_id"):
                    patch["shop_id"] = shop_id
                if not candidate.get("subscription_plan"):
                    patch["subscription_plan"] = "pos_online"
                if patch:
                    db.payments.update_one(
                        {"reference": reference},
                        {"$set": patch},
                    )
                    candidate.update(patch)

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail=(
                "No matching Paystack payment found for this shop. "
                "Double-check the reference, or contact support."
            ),
        )

    # 🔒 Security: refuse to repurpose another shop's payment.
    cand_shop = candidate.get("shop_id")
    if cand_shop and cand_shop != shop_id:
        raise HTTPException(
            status_code=403,
            detail="That Paystack reference belongs to a different shop.",
        )

    # 3. Force activation idempotently.
    activated = _activate_subscription(candidate)
    refreshed = db.shops.find_one({"_id": shop_id}) or {}
    return {
        "activated": bool(activated),
        "subscription_plan": refreshed.get("subscription_plan"),
        "online_enabled": bool(refreshed.get("online_enabled")),
        "reference": candidate.get("reference"),
        "amount": candidate.get("amount"),
    }


@router.delete("/shops/{shop_id}")
def delete_shop(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        return {"message": "Shop already deleted"}
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    db.assignments.delete_many({"shop_id": shop_id})
    db.users.update_many(
        {"assigned_shop_ids": shop_id},
        {"$pull": {"assigned_shop_ids": shop_id}},
    )
    db.shops.delete_one({"_id": shop_id})
    db.subscriptions.delete_one({"shop_id": shop_id})
    return {"message": "Shop deleted successfully"}


@router.get("/shopkeepers")
def list_shopkeepers(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] == "admin":
        users = list(db.users.find({"role": "shopkeeper"}, {"password": 0, "password_hash": 0}))
        return [_normalize_id(u) for u in users]

    owner_shop_ids = [s["_id"] for s in db.shops.find({"owner_id": user["_id"]}, {"_id": 1})]
    assigned_ids = db.assignments.distinct("shopkeeper_id", {"shop_id": {"$in": owner_shop_ids}})
    created_ids = [u["_id"] for u in db.users.find({"role": "shopkeeper", "created_by_owner_id": user["_id"]}, {"_id": 1})]
    ids = list({*assigned_ids, *created_ids})
    users = list(db.users.find({"_id": {"$in": ids}, "role": "shopkeeper"}, {"password": 0, "password_hash": 0}))
    return [_normalize_id(u) for u in users]


@router.post("/shopkeepers")
def create_shopkeeper(payload: dict = Body(...), user=Depends(require_roles("owner", "admin", "partner"))):
    """Owner-scoped shopkeeper creation. Tags the new shopkeeper with created_by_owner_id
    so the owner can see them in the Shopkeepers list and assign them to shops."""
    from backend.core.security import hash_password
    db = get_db()

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    full_name = (payload.get("full_name") or "").strip()

    if not email or not password or not full_name:
        raise HTTPException(status_code=400, detail="full_name, email and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    shopkeeper_id = str(uuid.uuid4())
    doc = {
        "_id": shopkeeper_id,
        "email": email,
        "password_hash": hash_password(password),
        "full_name": full_name,
        "role": "shopkeeper",
        "assigned_shop_ids": [],
        "created_by_owner_id": user["_id"] if user["role"] in {"owner", "partner"} else None,
        "created_at": datetime.utcnow().isoformat(),
    }
    db.users.insert_one(doc)
    return {
        "message": "Shopkeeper created",
        "shopkeeper": {
            "_id": shopkeeper_id,
            "email": email,
            "full_name": full_name,
            "role": "shopkeeper",
        },
    }


@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}")
def assign_shopkeeper(shop_id: str, shopkeeper_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    staff = db.users.find_one({"_id": shopkeeper_id, "role": "shopkeeper"})
    if not staff:
        raise HTTPException(status_code=404, detail="Shopkeeper not found")

    existing = db.assignments.find_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id})
    if not existing:
        db.assignments.insert_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id, "owner_id": shop["owner_id"], "created_at": datetime.utcnow().isoformat()})
    db.users.update_one(
        {"_id": shopkeeper_id},
        {"$addToSet": {"assigned_shop_ids": shop_id}},
    )
    return {"message": "Shopkeeper assigned"}


@router.get("/shops/{shop_id}/assignments")
def list_assignments(shop_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    raw = list(db.assignments.find({"shop_id": shop_id}, {"_id": 0, "shopkeeper_id": 1, "shop_id": 1}))
    sk_ids = [a["shopkeeper_id"] for a in raw]
    users = {u["_id"]: u for u in db.users.find(
        {"_id": {"$in": sk_ids}, "role": "shopkeeper"},
        {"password": 0, "password_hash": 0},
    )}
    assignments = []
    for a in raw:
        u = users.get(a["shopkeeper_id"], {})
        assignments.append({
            "shop_id": a["shop_id"],
            "shopkeeper_id": a["shopkeeper_id"],
            "shopkeeper_name": u.get("full_name") or u.get("name") or "",
            "shopkeeper_email": u.get("email") or "",
        })
    return {"assignments": assignments}


@router.post("/shops/{shop_id}/shopkeepers/{shopkeeper_id}/unassign")
def unassign_shopkeeper(shop_id: str, shopkeeper_id: str, user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not _is_owner_scope(user, shop):
        raise HTTPException(status_code=403, detail="Not allowed")

    db.assignments.delete_one({"shop_id": shop_id, "shopkeeper_id": shopkeeper_id})
    db.users.update_one(
        {"_id": shopkeeper_id},
        {"$pull": {"assigned_shop_ids": shop_id}},
    )
    return {"message": "Shopkeeper unassigned successfully"}


@router.get("/sales")
def get_sales(user=Depends(require_roles("owner", "admin", "partner"))):
    db = get_db()
    if user["role"] in {"owner", "partner"}:
        shops = list(db.shops.find({"owner_id": user["_id"]}, {"_id": 1, "name": 1, "subscription_plan": 1}))
    else:
        shops = list(db.shops.find({}, {"_id": 1, "name": 1, "subscription_plan": 1}))

    shop_by_id = {}
    for s in shops:
        sub = get_subscription(db, s["_id"])
        shop_by_id[s["_id"]] = {
            "name": s.get("name") or s["_id"],
            "plan": sub["plan"],
            "can_use_online": sub["features"]["online"],
        }

    shop_ids = list(shop_by_id.keys())

    orders = list(
        db.orders.find(
            {"shop_id": {"$in": shop_ids}, "payment_status": "confirmed"},
            {
                "_id": 1, "shop_id": 1, "total": 1, "created_at": 1,
                "created_by": 1, "customer_id": 1, "order_source": 1,
                "payment_method": 1, "profit": 1,
            },
        )
        .sort("created_at", -1)
        .limit(1000)
    )

    def is_online_order(o: dict) -> bool:
        # Online orders come from customer checkout; they have customer_id and no created_by operator
        if o.get("order_source") == "online":
            return True
        return bool(o.get("customer_id")) and not o.get("created_by")

    total_pos = 0.0
    total_online = 0.0
    total_orders = 0
    total_profit = 0.0

    per_shop = {
        sid: {
            "shop_id": sid,
            "shop_name": meta["name"],
            "plan": meta["plan"],
            "pos_revenue": 0.0,
            "online_revenue": 0.0,
            "orders": 0,
            "revenue": 0.0,
        }
        for sid, meta in shop_by_id.items()
    }

    recent = []
    for o in orders:
        sid = o["shop_id"]
        amount = float(o.get("total", 0))
        meta = shop_by_id.get(sid, {"name": sid, "plan": "expired", "can_use_online": False})
        online_flag = is_online_order(o)

        # Rule: online sales only counted for shops on a plan that includes online
        counts_online = online_flag and bool(meta.get("can_use_online"))

        if counts_online:
            total_online += amount
            per_shop[sid]["online_revenue"] += amount
        else:
            total_pos += amount
            per_shop[sid]["pos_revenue"] += amount

        per_shop[sid]["orders"] += 1
        per_shop[sid]["revenue"] += amount
        total_orders += 1
        total_profit += float(o.get("profit", 0) or 0)

        if len(recent) < 20:
            recent.append({
                "_id": str(o["_id"]),
                "shop_id": sid,
                "shop_name": meta["name"],
                "total": amount,
                "created_at": o.get("created_at"),
                "source": "online" if counts_online else "pos",
                "payment_method": o.get("payment_method"),
            })

    total_revenue = total_pos + total_online
    avg_order = (total_revenue / total_orders) if total_orders else 0

    return {
        "revenue": round(total_revenue, 2),
        "pos_revenue": round(total_pos, 2),
        "online_revenue": round(total_online, 2),
        "profit": round(total_profit, 2),
        "orders": total_orders,
        "avg_order": round(avg_order, 2),
        "shops": list(per_shop.values()),
        "recent": recent,
    }
