from fastapi import APIRouter, HTTPException, Depends, Body
from backend.db.mongo import get_db
from backend.schemas.auth import RegisterRequest, LoginRequest, RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from backend.core.deps import get_current_user
from backend.services.audit import audit_log
from backend.services.email_service import send_verification_email, send_password_reset_email, is_email_enabled
from datetime import datetime, timezone, timedelta
import random
import uuid
import hashlib
import secrets
import os

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _gen_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _user_response(user: dict) -> dict:
    # Resolve `assigned_shop_ids` from the canonical `assignments` collection
    # for shopkeepers so the frontend sidebar / POS shop picker always
    # reflects the latest owner action without re-login.
    assigned = user.get("assigned_shop_ids", []) or []
    if user.get("role") == "shopkeeper":
        from backend.core.deps import get_assigned_shop_ids
        assigned = get_assigned_shop_ids(user["_id"])

    return {
        "id": user["_id"],
        "email": user.get("email"),
        "phone": user.get("phone"),
        "name": user.get("full_name"),
        "role": user.get("role"),
        "assigned_shop_ids": assigned,
        "subscription_status": user.get("subscription_status", "active"),
        "is_verified": user.get("is_verified", True),
        "is_active": user.get("is_active", True),
        "must_change_password": bool(user.get("must_change_password", False)),
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
    identifier = payload.email.strip()
    normalized_phone_digits = "".join(ch for ch in identifier if ch.isdigit())
    if normalized_phone_digits.startswith("0") and len(normalized_phone_digits) == 10:
        normalized_phone = "+254" + normalized_phone_digits[1:]
    elif normalized_phone_digits.startswith("254") and len(normalized_phone_digits) == 12:
        normalized_phone = "+" + normalized_phone_digits
    elif identifier.startswith("+") and 10 <= len(normalized_phone_digits) <= 15:
        normalized_phone = "+" + normalized_phone_digits
    else:
        normalized_phone = None

    user = db.users.find_one({"email": identifier.lower()})
    if not user and normalized_phone:
        user = db.users.find_one({"phone": normalized_phone})
    if not user or not verify_password(payload.password, user.get("password_hash")):
        audit_log("auth_login", status="failed", metadata={"login_identifier": identifier})
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


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """Send a short-lived password reset link without revealing account existence."""
    generic_message = "If an account exists for that email, a password reset link has been sent."
    if not is_email_enabled():
        return {"message": generic_message}

    db = get_db()
    email = payload.email.lower()
    user = db.users.find_one({"email": email})
    if not user or user.get("is_active") is False:
        return {"message": generic_message}

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=30)

    # Keep only one active reset token per user; the raw token is never stored.
    db.password_reset_tokens.delete_many({"user_id": user["_id"]})
    db.password_reset_tokens.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user["_id"],
        "token_hash": token_hash,
        "created_at": now,
        "expires_at": expires_at,
    })

    frontend_url = os.getenv("FRONTEND_URL", "https://www.dukayko.com").rstrip("/")
    reset_url = f"{frontend_url}/reset-password?token={raw_token}"
    result = send_password_reset_email(email, reset_url)
    if not result.get("sent"):
        # Remove an unusable token and keep the response generic.
        db.password_reset_tokens.delete_one({"token_hash": token_hash})
    return {"message": generic_message}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    """Consume a one-time reset token and update the account password."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if len(payload.new_password) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 characters or fewer")

    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    db = get_db()
    reset_record = db.password_reset_tokens.find_one_and_delete({
        "token_hash": token_hash,
        "expires_at": {"$gt": now},
    })
    if not reset_record:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired. Request a new link.")

    user_id = reset_record["user_id"]
    update = db.users.update_one(
        {"_id": user_id, "is_active": {"$ne": False}},
        {"$set": {"password_hash": hash_password(payload.new_password),
                  "password_updated_at": now.isoformat()}},
    )
    if not update.matched_count:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired. Request a new link.")

    # Invalidate all refresh sessions after a successful password change.
    db.refresh_tokens.update_many(
        {"user_id": user_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now.isoformat()}},
    )
    db.password_reset_tokens.delete_many({"user_id": user_id})
    audit_log("auth_password_reset", actor_id=user_id, status="success")
    return {"message": "Your password has been reset. You can now sign in."}


@router.post("/change-password")
def change_password(payload: dict = Body(...), user=Depends(get_current_user)):
    """Complete the mandatory password change after an owner-issued temporary password."""
    if user.get("role") != "shopkeeper" or not user.get("must_change_password"):
        raise HTTPException(status_code=403, detail="Password change is not required for this account")

    new_password = payload.get("new_password") or ""
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if len(new_password) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 characters or fewer")

    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    db.users.update_one(
        {"_id": user["_id"], "role": "shopkeeper", "must_change_password": True},
        {"$set": {
            "password_hash": hash_password(new_password),
            "must_change_password": False,
            "password_updated_at": now,
        }},
    )
    audit_log("auth_forced_password_change", actor_id=user["_id"], status="success")
    return {"message": "Password updated successfully. You can now continue."}


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
