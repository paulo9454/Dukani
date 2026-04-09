from pydantic import BaseModel, Field
from typing import List, Literal, Optional

PaymentMethod = Literal["cash", "credit", "mpesa", "card", "paystack"]


class CartItemInput(BaseModel):
    product_id: str
    qty: int = Field(ge=1)


class CheckoutRequest(BaseModel):
    idempotency_key: Optional[str] = Field(default=None, min_length=4)
    payment_provider: str
    payment_method: PaymentMethod = "card"
    payment_meta: Optional[dict] = None


class ReceiveOrderRequest(BaseModel):
    received: bool = True


class POSCheckoutRequest(BaseModel):
    shop_id: str
    items: List[CartItemInput]
    payment_provider: str
    idempotency_key: Optional[str] = Field(default=None, min_length=4)
    payment_method: PaymentMethod = "cash"
    discount: float = Field(default=0, ge=0)
    tax_percent: float = Field(default=0, ge=0)
    payment_meta: Optional[dict] = None
