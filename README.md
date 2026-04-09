# Dukani (CloudDuka) Full-Stack E-commerce + POS

Production-ready starter implementing role-based commerce, subscription gating, stock-safe checkout, and test automation.

## Quick terminal run (recommended)

```bash
./scripts/run_backend.sh
```

## Quick terminal test (recommended)

```bash
./scripts/test_backend.sh
```

Both scripts create `.venv` if needed, install backend dependencies, and run with standard env defaults.

## Manual setup

### Backend
1. `python -m venv .venv && source .venv/bin/activate`
2. `pip install -r backend/requirements.txt`
3. `cp backend/.env.example backend/.env`
4. Start MongoDB (`mongodb://localhost:27017`)
5. `uvicorn backend.server:app --reload`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm start`

## Multi-shop owner capability (implemented)
- Owner can create multiple shops via `POST /api/dashboard/shops`
- Owner can assign a shopkeeper per shop via `POST /api/dashboard/shops/{shop_id}/assign/{staff_id}`
- Owner can bulk assign shopkeepers via `POST /api/dashboard/shops/{shop_id}/assignments/bulk`
- Owner can view shopkeeper allocations per shop via `GET /api/dashboard/shops/{shop_id}/assignments`

## Seeding (implemented)
Use:

```bash
curl -X POST http://127.0.0.1:8000/api/dev/seed
```

It seeds:
- owner account
- 2 shopkeepers
- 1 customer
- 2 shops
- shopkeeper allocations (one per shop)
- sample products with barcode + stock threshold

## New POS + Retail Extensions (non-breaking)
- POS search by product name or barcode (`GET /api/products?q=...&barcode=...`).
- POS pricing controls with tax/discount fields on `/api/orders/checkout`.
- Multi-payment support (`payment_method`: `cash`, `credit`, `mpesa`, `card`) while preserving existing payload compatibility.
- Credit ledger APIs:
  - `GET /api/credit-customers`
  - `POST /api/credit-customers/{ledger_id}/payment`
  - `GET /api/credit-payments/history`
- Damaged stock APIs (`/api/damaged-stock`) with automatic inventory reduction.
- Supplier management for owner only (`/api/suppliers`).
- Rule-based stock alerts (`/api/notifications/stock`) surfaced in owner/shopkeeper dashboards.

## Subscription plan extension
Legacy behavior remains supported; additional plan codes:
- `500` => POS only
- `1000` => POS + online store

Online checkout and public storefront still block POS-only shops.

## Migration notes (MongoDB)
No destructive migration required. New collections are created on first use:
- `credit_customers`
- `credit_payments_history`
- `damaged_stock`
- `suppliers`

## Testing
- Backend unit/integration: `pytest backend/tests -q`
- Frontend E2E: `cd frontend && npx playwright test`


## Security hardening (enterprise extension)
- Short-lived access tokens (30 min default) + refresh tokens (`/api/auth/refresh`).
- Rate limiting:
  - `/api/auth/login` => 5 req/min
  - `/api/orders/checkout` => 10 req/min
  - `/api/customer/*` => 30 req/min
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`.
- CORS restricted via `FRONTEND_ORIGINS` env.
- Audit logging (`audit_logs`) for login, checkout, stock/damage, supplier, credit actions.
- Idempotency support via `Idempotency-Key` header for checkout endpoints.
