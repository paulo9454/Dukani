from pydantic import BaseModel, Field
from typing import Literal


# 🔥 FIX: simplified POS role system (customer + owner only)
RoleType = Literal["customer", "owner"]

PlanType = Literal["pos", "online", "legacy"]


class Message(BaseModel):
    message: str


class IdempotencyHeader(BaseModel):
    idempotency_key: str = Field(min_length=8)
