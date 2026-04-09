from pydantic import BaseModel, Field
from typing import Optional


class CategoryCreate(BaseModel):
    name: str


class ProductCreate(BaseModel):
    shop_id: str
    name: str
    description: Optional[str] = ""
    price: float = Field(gt=0)
    stock: int = Field(ge=0)
    category_id: Optional[str] = None
    is_public: bool = True
    barcode: Optional[str] = None
    low_stock_threshold: int = Field(default=5, ge=1)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    stock: Optional[int] = Field(default=None, ge=0)
    category_id: Optional[str] = None
    is_public: Optional[bool] = None
    barcode: Optional[str] = None
    low_stock_threshold: Optional[int] = Field(default=None, ge=1)
