from pydantic import BaseModel, Field
from typing import Optional


# =========================
# CATEGORY
# =========================
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


# =========================
# PRODUCT CREATE
# =========================
class ProductCreate(BaseModel):
    shop_id: str = Field(..., min_length=1)

    name: str = Field(..., min_length=2, max_length=200)

    description: Optional[str] = Field(default="")

    price: float = Field(..., gt=0)

    stock: int = Field(..., ge=0)

    category_id: Optional[str] = None

    is_public: bool = True

    # 🔥 IMPORTANT FOR POS (barcode scanning)
    barcode: Optional[str] = Field(default=None, min_length=0, max_length=100)

    # low stock alert
    low_stock_threshold: int = Field(default=5, ge=1)


# =========================
# PRODUCT UPDATE
# =========================
class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)

    description: Optional[str] = None

    price: Optional[float] = Field(default=None, gt=0)

    stock: Optional[int] = Field(default=None, ge=0)

    category_id: Optional[str] = None

    is_public: Optional[bool] = None

    barcode: Optional[str] = Field(default=None, max_length=100)

    low_stock_threshold: Optional[int] = Field(default=None, ge=1)
