from pydantic import BaseModel, Field
from typing import Literal


RoleType = Literal["owner", "admin", "partner", "shopkeeper", "customer"]
PlanType = Literal["pos", "online", "legacy"]


class Message(BaseModel):
    message: str


class IdempotencyHeader(BaseModel):
    idempotency_key: str = Field(min_length=8)
