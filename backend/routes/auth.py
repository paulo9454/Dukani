from fastapi import APIRouter, HTTPException
from backend.db.mongo import get_db
from backend.schemas.auth import RegisterRequest, LoginRequest, AuthResponse, RefreshRequest
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from backend.services.audit import audit_log
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest):
    db = get_db()
    if db.users.find_one({"email": payload.email.lower()}):
        audit_log("auth_register", status="failed", metadata={"email": payload.email.lower(), "reason": "duplicate"})
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    db.users.insert_one(
        {
            "_id": user_id,
            "email": payload.email.lower(),
            "password_hash": hash_password(payload.password),
            "full_name": payload.full_name,
            "role": payload.role,
            "assigned_shop_ids": [],
        }
    )

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
    return AuthResponse(access_token=access_token, role=payload.role, refresh_token=refresh_token)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    db = get_db()
    user = db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        audit_log("auth_login", status="failed", metadata={"email": payload.email.lower()})
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
    return AuthResponse(access_token=access_token, role=user["role"], refresh_token=refresh_token)


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest):
    db = get_db()
    stored = db.refresh_tokens.find_one({"token": payload.refresh_token, "revoked": False})
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
    return AuthResponse(access_token=access_token, role=user["role"], refresh_token=payload.refresh_token)
