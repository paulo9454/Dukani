from pydantic import BaseModel, Field
from typing import Literal


class ShopCreateRequest(BaseModel):
    name: str = Field(min_length=2)
    subscription_plan: Literal["pos", "online", "legacy"] = "legacy"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
