from pydantic import BaseModel, EmailStr, Field
from backend.schemas.common import RoleType
from typing import Optional


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    device_id: Optional[str] = Field(default=None, min_length=16, max_length=128)

    # 🔥 FIX: only allow customer or owner (enforced by RoleType)
    role: RoleType


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: RoleType
    refresh_token: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=8, max_length=72)
