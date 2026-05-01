from pydantic import BaseModel, Field
from typing import Literal, Optional


class ShopCreateRequest(BaseModel):
    name: str = Field(min_length=2)

    # ✅ ONLY TWO PLANS ALLOWED
    subscription_plan: Literal["pos", "pos_online"] = "pos"

    # ✅ safer typing for frontend (prevents 422 from missing/empty values)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = Field(default=None, max_length=500)
