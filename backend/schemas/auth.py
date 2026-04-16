from pydantic import BaseModel, EmailStr, Field
from backend.schemas.common import RoleType
from typing import Optional


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str

    # 🔥 FIX: only allow customer or owner (enforced by RoleType)
    role: RoleType


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: RoleType
    refresh_token: Optional[str] = None
