from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.core.security import decode_token
from backend.db.mongo import get_db

security = HTTPBearer()


# =========================
# 🔐 GET CURRENT USER
# =========================
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing credentials")

    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user id")

    db = get_db()

    user = db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# =========================
# 🔐 ROLE CHECKER
# =========================
def require_roles(*roles):
    def _inner(user=Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return _inner


# =========================
# 🧠 TENANT HELPERS (NEW CORE FIX)
# =========================

def is_shop_owner(shop, user):
    return user["role"] == "admin" or shop["owner_id"] == user["_id"]


def require_shop_access(shop_id: str, user: dict):
    db = get_db()

    shop = db.shops.find_one({
        "_id": shop_id
    })

    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # 🔐 OWNER CHECK
    if user["role"] in ["owner", "partner"]:
        if shop["owner_id"] != user["_id"]:
            raise HTTPException(status_code=403, detail="Not your shop")

    # 🔐 ADMIN ALLOW ALL
    if user["role"] == "admin":
        return shop

    # 🔐 SHOPKEEPER MUST BE ASSIGNED VIA COLLECTION (NOT USER FIELD)
    if user["role"] == "shopkeeper":
        assignment = db.assignments.find_one({
            "shop_id": shop_id,
            "shopkeeper_id": user["_id"]
        })

        if not assignment:
            raise HTTPException(
                status_code=403,
                detail="Not assigned to this shop"
            )

    return shop
