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
from backend.services.email_service import send_verification_email, is_email_enabled
from datetime import datetime, timezone, timedelta
import random
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _gen_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _user_response(user: dict) -> dict:
    return {
        "id": user["_id"],
        "email": user.get("email"),
        "name": user.get("full_name"),
        "role": user.get("role"),
        "assigned_shop_ids": user.get("assigned_shop_ids", []),
        "subscription_status": user.get("subscription_status", "active"),
        "is_verified": user.get("is_verified", True),
        "is_active": user.get("is_active", True),
    }


@router.post("/register")
def register(payload: RegisterRequest):
    db = get_db()
    email = payload.email.lower()

    # Dukayko is an owner-facing app — customers order via /shop/:slug and never
    # need an account. Reject customer registrations cleanly.
    if payload.role == "customer":
        raise HTTPException(
            status_code=400,
            detail="Customer accounts aren't used in Dukayko. Open a shop link to order.",
        )

    if db.users.find_one({"email": email}):
        audit_log("auth_register", status="failed",
                  metadata={"email": email, "reason": "duplicate"})
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    trial_start = datetime.now(timezone.utc) if payload.role == "owner" else None
    trial_end = trial_start + timedelta(days=14) if trial_start else None

    # If SMTP is configured, require email verification before login.
    require_verification = is_email_enabled()
    code = _gen_code() if require_verification else None

    user_doc = {
        "_id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "role": payload.role,
        "assigned_shop_ids": [],
        "is_active": True,
        "is_verified": not require_verification,
        "verification_code": code,
        "verification_sent_at": datetime.now(timezone.utc).isoformat() if code else None,
        "plan": "pos" if payload.role == "owner" else None,
        "subscription_status": "trial" if payload.role == "owner" else "active",
        "trial_start": trial_start.isoformat() if trial_start else None,
        "trial_end": trial_end.isoformat() if trial_end else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.users.insert_one(user_doc)

    if require_verification and code:
        send_verification_email(email, code)
        audit_log("auth_register", actor_id=user_id, status="pending_verification")
        return {
            "message": "Verification code sent to your email",
            "email": email,
            "requires_verification": True,
        }

    # Auto-login when email verification is disabled (dev / no SMTP).
    access_token = create_access_token(user_id, payload.role)
    refresh_token = create_refresh_token(user_id)
    db.refresh_tokens.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "token": refresh_token,
        "revoked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    audit_log("auth_register", actor_id=user_id, status="success")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _user_response(user_doc),
        "requires_verification": False,
    }


@router.post("/verify-email")
def verify_email(payload: dict):
    db = get_db()
    email = (payload.get("email") or "").lower()
    code = payload.get("code") or ""
    if not email or not code:
        raise HTTPException(status_code=400, detail="email and code are required")

    user = db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("is_verified"):
        return {"verified": True, "message": "Already verified"}
    if str(user.get("verification_code")) != str(code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_verified": True}, "$unset": {"verification_code": ""}},
    )
    audit_log("auth_verify_email", actor_id=user["_id"], status="success")

    user["is_verified"] = True
    access_token = create_access_token(user["_id"], user["role"])
    refresh_token = create_refresh_token(user["_id"])
    db.refresh_tokens.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user["_id"],
        "token": refresh_token,
        "revoked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "verified": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.post("/resend-verification")
def resend_verification(payload: dict):
    db = get_db()
    email = (payload.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    user = db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("is_verified"):
        return {"message": "Already verified", "requires_verification": False}
    if not is_email_enabled():
        # Auto-verify when no SMTP — dev/testing fallback.
        db.users.update_one({"_id": user["_id"]},
                            {"$set": {"is_verified": True}, "$unset": {"verification_code": ""}})
        return {"message": "Auto-verified (SMTP not configured)", "requires_verification": False}

    code = _gen_code()
    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"verification_code": code,
                  "verification_sent_at": datetime.now(timezone.utc).isoformat()}},
    )
    send_verification_email(email, code)
    return {"message": "Verification code re-sent", "requires_verification": True}


@router.post("/login")
def login(payload: LoginRequest):
    db = get_db()
    user = db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash")):
        audit_log("auth_login", status="failed",
                  metadata={"email": payload.email.lower()})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Account disabled")
    if user.get("is_verified") is False:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Check your inbox or use /api/auth/resend-verification",
        )

    access_token = create_access_token(user["_id"], user["role"])
    refresh_token = create_refresh_token(user["_id"])
    db.refresh_tokens.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user["_id"],
        "token": refresh_token,
        "revoked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    audit_log("auth_login", actor_id=user["_id"], status="success")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _user_response(user),
    }


@router.get("/me")
def get_me(user=Depends(get_current_user)):
    return _user_response(user)


@router.post("/refresh")
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
    return {
        "access_token": access_token,
        "refresh_token": payload.refresh_token,
        "token_type": "bearer",
        "user": _user_response(user),
    }
