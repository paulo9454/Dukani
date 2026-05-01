from pydantic import BaseModel, EmailStr


class ShopkeeperCreateRequest(BaseModel):
    email: EmailStr
    password: str
