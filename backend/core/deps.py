from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.core.security import decode_token
from backend.db.mongo import get_db

security = HTTPBearer()


# 🔐 GET CURRENT USER (FIXED & SAFE)
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    # ensure correct token type
    if payload.get("type") not in {None, "access"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user id",
        )

    db = get_db()

    user = db.users.find_one({"_id": user_id})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


# 🔐 ROLE CHECKER (FIXED SAFE VERSION)
def require_roles(*roles):
    def _inner(user=Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return user

    return _inner


# 🏪 SHOP ACCESS (UNCHANGED LOGIC, SAFER CHECKS)
def require_shop_access(shop_id: str, user: dict):
    if user.get("role") == "shopkeeper":
        if shop_id not in user.get("assigned_shop_ids", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Shopkeeper not assigned to this shop",
            )
