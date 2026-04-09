from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import (
    auth,
    products,
    orders,
    customer,
    marketplace,
    payments,
    dashboard,
    public,
    credit,
    credit_history,
    damaged_stock,
    suppliers,
    notifications,
)
from backend.db.mongo import get_db
from backend.services.seed import seed_full_data
from backend.core.settings import settings
from backend.middleware.rate_limit import RateLimiterMiddleware
from backend.middleware.security_headers import SecurityHeadersMiddleware
import uuid

app = FastAPI(title="Dukani API", version="1.2.0", description="Production-ready Dukani e-commerce and POS platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware)

for m in app.user_middleware:
    if m.cls.__name__ == "RateLimiterMiddleware":
        rate_limiter_middleware = m
        break
else:
    rate_limiter_middleware = None

for router in [
    auth.router,
    products.router,
    orders.router,
    customer.router,
    marketplace.router,
    payments.router,
    dashboard.router,
    public.router,
    credit.router,
    credit_history.router,
    damaged_stock.router,
    suppliers.router,
    notifications.router,
]:
    app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/dev/seed")
def seed_data():
    db = get_db()
    if db.categories.count_documents({}) == 0:
        db.categories.insert_many(
            [
                {"_id": str(uuid.uuid4()), "name": "Electronics"},
                {"_id": str(uuid.uuid4()), "name": "Fashion"},
            ]
        )
    return seed_full_data()
