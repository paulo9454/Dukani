from fastapi import APIRouter, HTTPException, Depends
from backend.db.mongo import get_db
from backend.schemas.auth import RegisterRequest, LoginRequest, RefreshRequest
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from backend.core.deps import get_current_user
from backend.services.audit import audit_log
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register(payload: RegisterRequest):
    db = get_db()

    email = payload.email.lower()

    if db.users.find_one({"email": email}):
        audit_log(
            "auth_register",
            status="failed",
            metadata={"email": email, "reason": "duplicate"},
        )
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())

    trial_start = datetime.now(timezone.utc) if payload.role == "owner" else None
    trial_end = trial_start + timedelta(days=14) if trial_start else None

    user_doc = {
        "_id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "role": payload.role,
        "assigned_shop_ids": [],
        "plan": "pos" if payload.role == "owner" else None,
        "subscription_status": "trial" if payload.role == "owner" else "active",
        "trial_start": trial_start.isoformat() if trial_start else None,
        "trial_end": trial_end.isoformat() if trial_end else None,
    }

    db.users.insert_one(user_doc)

    access_token = create_access_token(user_id, payload.role)
    refresh_token = create_refresh_token(user_id)

    db.refresh_tokens.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "token": refresh_token,
            "revoked": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    audit_log("auth_register", actor_id=user_id, status="success")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": email,
            "name": payload.full_name,
            "role": payload.role,
            "assigned_shop_ids": [],
            "subscription_status": user_doc["subscription_status"],
        },
    }


@router.post("/login")
def login(payload: LoginRequest):
    db = get_db()

    user = db.users.find_one({"email": payload.email.lower()})

    if not user or not verify_password(payload.password, user["password_hash"]):
        audit_log(
            "auth_login",
            status="failed",
            metadata={"email": payload.email.lower()},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user["_id"], user["role"])
    refresh_token = create_refresh_token(user["_id"])

    db.refresh_tokens.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": user["_id"],
            "token": refresh_token,
            "revoked": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    audit_log("auth_login", actor_id=user["_id"], status="success")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user["_id"],
            "email": user.get("email"),
            "name": user.get("full_name"),
            "role": user.get("role"),
            "assigned_shop_ids": user.get("assigned_shop_ids", []),
            "subscription_status": user.get("subscription_status", "active"),
        },
    }


@router.get("/me")
def get_me(user=Depends(get_current_user)):
    return {
        "id": user["_id"],
        "email": user.get("email"),
        "name": user.get("full_name"),
        "role": user.get("role"),
        "assigned_shop_ids": user.get("assigned_shop_ids", []),
        "subscription_status": user.get("subscription_status", "active"),
    }


@router.post("/refresh")
def refresh(payload: RefreshRequest):
    db = get_db()

    stored = db.refresh_tokens.find_one(
        {"token": payload.refresh_token, "revoked": False}
    )

    if not stored:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    try:
        token_payload = decode_token(payload.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.users.find_one({"_id": token_payload.get("sub")})

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token(user["_id"], user["role"])

    return {
        "access_token": access_token,
        "refresh_token": payload.refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user["_id"],
            "email": user.get("email"),
            "name": user.get("full_name"),
            "role": user.get("role"),
            "assigned_shop_ids": user.get("assigned_shop_ids", []),
            "subscription_status": user.get("subscription_status", "active"),
        },
    }
