import os
import sys
import uuid

# Ensure repo root (parent of /app/backend) is on sys.path so `from backend.X` imports work
# regardless of current working directory (supervisor runs uvicorn from /app/backend).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.routers import categories
from backend.db.mongo import get_db
from backend.services.seed import seed_full_data
from backend.middleware.rate_limit import RateLimiterMiddleware
from backend.middleware.security_headers import SecurityHeadersMiddleware

from backend.routers import (
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
    customer,
    owner,
    pos,
    public,
    products,
    orders,
    analytics,
)

# =========================
# ✅ ADDED INVENTORY ROUTER
# =========================
from backend.routers.inventory import router as inventory_router

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

# =========================
# MIDDLEWARE
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware)

# =========================
# ROUTES
# =========================
app.include_router(owner.router)
app.include_router(pos.router, tags=["POS"])
app.include_router(public.router)

app.include_router(auth.router)
app.include_router(marketplace.router)
app.include_router(payments.router)
app.include_router(dashboard.router)
app.include_router(credit.router)
app.include_router(credit_history.router)
app.include_router(damaged_stock.router)
app.include_router(suppliers.router)
app.include_router(notifications.router)
app.include_router(shop.router)
app.include_router(customer.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(analytics.router)
# =========================
# ✅ INVENTORY ROUTER ADDED
# =========================
app.include_router(inventory_router)

# =========================
# DOCS UI
# =========================
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

@app.get("/docs/favicon.ico", include_in_schema=False)
def docs_favicon():
    return FileResponse(
        os.path.join(DOCS_DIR, "logo.svg"),
        media_type="image/svg+xml"
    )

# =========================
# HEALTH CHECK
# =========================
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/health")
def api_health():
    """Deep health: DB ping + integration env presence."""
    db_ok = False
    try:
        db = get_db()
        db.command("ping") if hasattr(db, "command") else db.shops.count_documents({})
        db_ok = True
    except Exception:
        db_ok = False

    integrations = {
        "paystack": bool(os.environ.get("PAYSTACK_SECRET_KEY")),
        "mpesa": all(os.environ.get(k) for k in [
            "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET",
            "MPESA_SHORTCODE", "MPESA_PASSKEY",
        ]),
        "smtp": bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM")),
    }
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "integrations": integrations,
        "version": "1.3.0",
    }


# =========================
# STARTUP ENV VALIDATION (warn, never fail)
# =========================
@app.on_event("startup")
def _validate_env():
    import logging
    logger = logging.getLogger("dukayko")
    required = ["MONGO_URL", "DB_NAME", "JWT_SECRET"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        logger.warning("Missing required env vars: %s", missing)
    optional = {
        "Paystack live": ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY"],
        "M-Pesa live": ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_URL"],
        "SMTP": ["SMTP_HOST", "SMTP_FROM"],
    }
    for label, keys in optional.items():
        missing_opt = [k for k in keys if not os.environ.get(k)]
        if missing_opt:
            logger.info("Optional integration %s disabled (missing %s)", label, missing_opt)


# =========================
# DEV SEED
# =========================
@app.post("/api/dev/seed")
def seed_data():
    db = get_db()

    if db.categories.count_documents({}) == 0:
        db.categories.insert_many([
            {"_id": str(uuid.uuid4()), "name": "Electronics"},
            {"_id": str(uuid.uuid4()), "name": "Fashion"},
        ])

    return seed_full_data()
