from pydantic import BaseModel, Field
from typing import List, Literal, Optional

PaymentMethod = Literal["cash", "credit", "mpesa", "card", "paystack"]


class CartItemInput(BaseModel):
    product_id: str
    qty: int = Field(ge=1)
    # Unit-based: caller picks a selling-unit label (e.g. "250g").
    unit_label: Optional[str] = None
    # Variant: caller picks a variant name (e.g. "Medium").
    variant_name: Optional[str] = None
    price_mode: Optional[str] = None  # retail | wholesale (POS only)


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
