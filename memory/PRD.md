# Dukani – PRD (Deployment Setup on Emergent)

## Original Problem Statement
"i want to deploy the app dukani here get it from github" — GitHub: `paulo9454/Dukani` (main branch).
User also supplied a deep audit blueprint describing Dukani as a multi-role commerce platform (FastAPI + React/Vite + MongoDB) covering owner, shopkeeper, customer, POS, marketplace, inventory, credit, suppliers, notifications, subscriptions, etc.

## Architecture (as shipped)
- Backend: FastAPI (uvicorn) in `/app/backend`, package-style imports (`from backend...`), MongoDB (pymongo), JWT access/refresh auth, rate limiting, security headers, audit logs, idempotency, Celery tasks (optional).
- Frontend: React 19 + Vite 8 in `/app/frontend` (axios client), role-based shells: Owner, Shopkeeper, Customer, POS.
- Data: MongoDB `dukani` database.

## Emergent Adaptations Applied
1. Inserted `sys.path.insert(0, repo_root)` at top of `backend/server.py` so supervisor's `uvicorn server:app` (cwd=`/app/backend`) can still resolve `from backend.X` imports.
2. Made celery import in `backend/__init__.py` optional (try/except) so API runtime does not require redis/celery.
3. Pinned `pydantic-core==2.20.1` to match `pydantic==2.8.2` (fixed `validate_core_schema` ImportError).
4. Backend `.env` created at both `/app/backend/.env` (Emergent protected) and `/app/.env` (repo settings loader path).
5. Frontend: added `start` script to `package.json` (`vite --host 0.0.0.0 --port 3000`), configured `vite.config.js` with host/port/`allowedHosts: true` and WSS HMR.
6. Replaced hardcoded `http://127.0.0.1:8000` in `api/client.js`, `api/axios.js`, `api/auth.js`, and `apps/pos/PosApp.jsx` with `import.meta.env.VITE_BACKEND_URL`.
7. Frontend `.env` created with `VITE_BACKEND_URL` = Emergent preview URL.
8. Removed duplicate `/static` StaticFiles mount on server.py.

## Verification (May 1, 2026)
- `GET /health` → `{"status":"ok"}` via preview URL.
- `POST /api/dev/seed` → seeded owner, 2 shopkeepers, customer, 2 shops, 2 products.
- `POST /api/auth/login` with seeded owner → returns access + refresh tokens.
- Frontend UI login as owner redirects to `/owner` and renders Owner Dashboard (Shops=2, Revenue=KES 0, Shopkeepers=0, Assignments=0 — consistent with seed and with the repo's recently-shipped tenant-isolation fix).
- Supervisor: backend + frontend + mongodb all RUNNING.

## What's Implemented (in repo, already present)
- Multi-role auth (JWT access+refresh), rate limiting, CORS, security headers, audit logs, idempotency keys.
- Owner: shops CRUD, shopkeeper listing (tenant-scoped after audit fix), shop assignment/unassign, bulk assignments, dashboard overview, revenue stats.
- Shopkeeper: shop home, POS access.
- POS: product search (name/barcode), cart, multi-payment (cash/credit/mpesa/card), receipts, tax/discount, damaged stock.
- Customer/Marketplace: public shop/product browsing, cart, checkout.
- Inventory: products, categories, restock (single+bulk), stock alerts, damaged stock.
- Credit: credit customers ledger, payments, history.
- Suppliers (owner-only), notifications, subscriptions (`trial_pos`, `pos`, `pos_online`, `online`, `legacy`).

## Not Running / Deferred
- Celery workers + redis (scheduled daily reports) — optional; safely skipped for API-only runtime.
- Playwright E2E tests (`frontend/playwright`) — not executed here.
- Backend pytest suite — not executed here; user didn't request it.

## Next Action Items
- Click **Deploy** in Emergent to ship this to production (`Deploy` button in the top-right).
- If you want Celery/redis for scheduled reports, install redis + celery worker as a separate supervisor program.
- Tighten CORS (`FRONTEND_ORIGINS` is `*` right now; scope to the deployed domain later).
- Run the included `pytest backend/tests -q` and fix anything that fails for your workflow.

## Prioritized Backlog (from user's own audit)
- P0: C1 owner dashboard scoping (repo commit `39a4ab3` addresses this — confirm it holds end-to-end).
- P0: C2 shopkeeper directory tenant scoping.
- P0: C3 unify assignment model (single source of truth in `assignments` collection).
- P1: H1 frontend/backend contract shape for assignments; H2 ownership check on all unassign paths; H3 subscription taxonomy normalization.
- P2: legacy owner screen cleanup, response schema enforcement, partner role policy matrix, RBAC/contract test suite in CI.

## Future Enhancements
- SMS/WhatsApp receipts via Twilio (Kenya-friendly) + M-Pesa STK Push live integration.
- Daily owner email digest (SendGrid/Resend) once Celery is wired.
- Offline-first POS (service worker + IndexedDB queue) for shops with shaky internet.

## Session: Feb 2026 — Image visibility & Loading flash fixes
- Root cause of missing product images: `products.py` upload path resolved to
  `/app/static/products/` but `StaticFiles` was mounted on `/app/backend/static/`.
  Fixed `upload_dir` in `routers/products.py` (create + update) to write into
  `BASE_DIR/static/products`, moved existing files, and removed the stale
  `/app/static/` directory. Existing DB rows already used `/api/static/...` URLs.
- Root cause of constant "Loading..." flash: `loadingUser` defaulted to `true`
  on every render. Fixed in `App.jsx` by initializing it lazily — only `true`
  when a token exists AND no cached user role is in `localStorage`. Also moved
  the public-route early returns BELOW the `useEffect` calls to keep hook order
  stable across navigations.
- Verified: `https://.../api/static/products/<file>` returns 200 through the
  Kubernetes ingress. `/shop/gomba1` renders both product images. No flash on
  login → owner dashboard transition.
