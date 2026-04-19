import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.routes import (
    auth,
    marketplace,
    payments,
    dashboard,
    credit,
    credit_history,
    damaged_stock,
    suppliers,
    notifications,
    shop,
    customer,  # ✅ FIX: added missing customer routes
)
from backend.routers import owner, pos, public
from backend.db.mongo import get_db
from backend.services.seed import seed_full_data
from backend.core.settings import settings
from backend.middleware.rate_limit import RateLimiterMiddleware
from backend.middleware.security_headers import SecurityHeadersMiddleware
import uuid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DOCS_DIR = os.path.join(STATIC_DIR, "docs")

app = FastAPI(
    title="Dukani API",
    version="1.2.0",
    description="Production-ready Dukani e-commerce and POS platform",
    docs_url=None,
    redoc_url=None,
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 🔥 allow everything (dev only)
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

# New router namespace first
app.include_router(owner.router)
app.include_router(pos.router, tags=["POS"])
app.include_router(public.router)
print("✅ POS router loaded")

# Legacy routes second
for router in [
    auth.router,
    marketplace.router,
    payments.router,
    dashboard.router,
    credit.router,
    credit_history.router,
    damaged_stock.router,
    suppliers.router,
    notifications.router,
    shop.router,
    customer.router,  # customer cart/order views only (checkout is POS-owned)
]:
    app.include_router(router)


@app.get("/docs", include_in_schema=False)
def custom_swagger_ui_html():
    return HTMLResponse(
        """<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dukani API - Swagger UI</title>
    <link rel="icon" href="/docs/favicon.ico" />
    <link rel="stylesheet" href="/static/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>

    <script src="/static/docs/swagger-ui-bundle.js"></script>
    <script src="/static/docs/swagger-ui-standalone-preset.js"></script>
    <script src="/static/docs/swagger-initializer.js"></script>

  </body>
</html>"""
    )


@app.get("/docs", include_in_schema=False)
def custom_swagger_ui_html():
    return HTMLResponse("""
<!DOCTYPE html>
<html>
  <head>
    <title>Dukani API Docs</title>
    <link rel="stylesheet" href="/static/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>

    <script src="/static/docs/swagger-ui-bundle.js"></script>
    <script src="/static/docs/swagger-initializer.js"></script>
  </body>
</html>
""")


@app.get("/docs/favicon.ico", include_in_schema=False)
def docs_favicon():
    return FileResponse(os.path.join(DOCS_DIR, "logo.svg"), media_type="image/svg+xml")


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
