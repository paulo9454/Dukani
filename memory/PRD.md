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

## Session: Feb 2026 — Categories fix + checkout readiness
- POS/public-shop were filtering by `product.category_id` (empty) instead of
  `product.category` (slug saved by ProductModal). Replaced the dynamic bar
  with slug-based `DEFAULT_CATEGORIES`, showing only categories that have ≥1
  product, with filter + label on each card in POS and `/shop/{slug}`.
- Cleaned up dead nested `createCreditor` inside `PosApp.checkout`.
- Confirmed checkout readiness: cash/credit work without external keys; M-Pesa
  STK push and Paystack initialize use `backend/.env` keys (currently empty).

## Session: Feb 2026 — 404 dead-end fix + deploy guard
- Settings `load_dotenv(override=False)` confirmed to keep deploy `MONGO_URL`.
- Replaced dead-end 404 in `App.jsx` with auto-redirect to the user's dashboard
  (owner → /owner, shopkeeper → /shopkeeper). Unauthenticated users always see
  the login screen regardless of path.

## Session: Feb 2026 — Landing page
- New `/` route for unauthenticated visitors: minimalist, mobile-first
  conversion page at `pages/LandingPage.jsx`.
- Sections: hero ("Sell online with M-Pesa in minutes."), live browser-chrome
  shop preview (Mama Mboga Kitchen with 3 emoji products + cart + Pay with
  M-Pesa), How it works (3 steps), 4 feature bullets, trust line, dark
  final-CTA card, footer.
- CTAs wire to `/register`. URL-aware auth view: `/register` and `/login`
  deep-link into the correct form and history updates via `pushState` when
  users toggle between them.
- Authed owners still auto-redirect to `/owner`; track/order/shop routes
  unchanged.
- Verified: CTA navigates to /register, register form renders, CTA height
  50 px, no horizontal overflow.

## Session: Feb 2026 — Test STK push
- `POST /api/shop/{id}/mpesa-settings/test` fires a KES 1 STK push using the
  shop's saved Daraja credentials (no order created, no stock touched).
- Differentiates errors clearly: 400 missing keys / bad phone · 403 wrong
  role · 502 Daraja rejection with copy "Double-check consumer key, consumer
  secret, shortcode, passkey, environment."
- UI: "🧪 Test STK push" tile inside `MPesaSettingsModal` appears only when
  `mpesa_configured=true`. Phone input + "Send test prompt" button; success
  banner shows reference + environment, error banner shows Daraja detail.
- After Save, modal re-fetches settings so the Test tile appears immediately
  on first configure (no need to reopen).

## Session: Feb 2026 — Merchant scalability pass
- **Resend M-Pesa prompt**: new `POST /api/payments/mpesa/retry` re-fires
  STK push for the same order without creating a new order / reserving stock
  again. Guarded by `MPESA_MAX_RETRIES=3`, `MPESA_RETRY_COOLDOWN_SECS=15`,
  and phone-match authorisation (falls back to owner/admin/partner role).
  `CheckoutModal.jsx` shows the "Didn't receive the prompt?" tile only on
  `timeout`/`failed`, restarts the 90 s countdown + polling on click, and
  shows remaining retries / cooldown/limit errors inline.
- **Per-shop M-Pesa config**: extended `shops` doc with
  `mpesa_{consumer_key,consumer_secret,shortcode,passkey,env,business_name}`.
  `_mpesa_cfg()` resolves per-shop first, env fallback second. New
  `GET/PUT /api/shop/{id}/mpesa-settings` (owner-only, secrets returned
  only as masked previews e.g. `ck•••••••••90`). New
  `MPesaSettingsModal.jsx` wired to `Shops.jsx` via a `💳 M-Pesa settings`
  button next to each shop. Saving only transmits fields the owner actually
  typed, so blank input never wipes an existing secret.
- **CORS hardening**: `server.py` picks origins from env — `DUKAYKO_DEV=1`
  (dev/preview) keeps wildcard, production reads a comma-separated
  `CORS_ALLOWED_ORIGINS`. Methods restricted to the six we use.
- **Real-user observability**: `GET /api/analytics/shop/{id}` now returns a
  `summary` block with views, add_to_cart, checkout_start, orders,
  paid_orders, conversion_rate, paid_rate. Owner Dashboard renders a
  per-shop funnel table using this summary.
- Verified end-to-end via curl + browser: settings PUT/GET round-trips,
  retry endpoint validates order existence, analytics summary calculates
  correctly, CORS preflight still 200s on preview.

## Session: Feb 2026 — Track Order tile + M-Pesa live feedback
- Added `GET /api/orders/lookup?phone=<>&slug=<>` — public endpoint, returns the
  most recent order for a phone number (optionally scoped to a shop slug).
  Inserted before the generic `/{order_id}` route so the path matches first.
- `/shop/{slug}` now has an **"Already ordered?"** tile (phone input + Track
  order button). On submit it calls the lookup endpoint and redirects to
  `/track/{id}?contact=<phone>`. Handles 404 gracefully with inline error.
- Rewrote `CheckoutModal.jsx` for M-Pesa:
  1. On `Pay` → POSTs `/orders/create` → `/payments/mpesa/stk-push` in one shot.
  2. Switches to a **status modal** with spinner, "📲 Check your phone",
     customer phone echoed back, total echoed back, and 3-step PIN guide.
  3. Polls `/api/orders/track/{id}` every 3 s for up to 90 s.
  4. Flips to success / failed / timeout view driven by `payment_status`
     returned by the backend callback.
- Verified via Playwright: countdown ticks 90 → 88s, status modal renders
  with correct copy, lookup returns real order IDs from DB.

## Session: Feb 2026 — UI reliability, contrast, mobile-first, PWA
- Added `utils/imageUrl.js` — single resolver handling http/https, legacy
  `/static/*`, current `/api/static/*`, and relative paths. Uses
  `VITE_BACKEND_URL` on production builds.
- Added `components/ProductImage.jsx` — cached-aware image with shimmer
  skeleton, `onError` fallback ("No image"), `loading="lazy"` + async decode,
  150ms fade-in on load. Used in POS, public shop and inventory.
- Rewrote `index.css` — removed Vite template leftovers (1126px lock,
  centered text, dark mode bleed). New tokens give WCAG-AA contrast:
  `--dk-text #0f172a` (primary), `--dk-text-muted #475569` (secondary),
  `--dk-text-subtle #334155`. Locked to light mode (`color-scheme: light`).
- Mobile-first responsive rules: `.dk-stack-mobile`, `.dk-pos-cart` → full
  width on phones; `.dk-owner-sidebar` collapses to horizontal scroll bar
  under 768px. Thumb-friendly 44–46px button minimums.
- Updated `PosApp.jsx`, `PublicShopPage.jsx`, `ProductsPage.jsx` (inventory),
  `ProductModal.jsx`, `OwnerShell.jsx`, `App.jsx` — replaced faint grays
  (#777, #999, #666) with readable ones, added test IDs, wired ProductImage.
- PWA: created `public/manifest.json` (standalone, portrait, brand green
  theme), linked it in `index.html` along with `apple-mobile-web-app-*` and
  `viewport-fit=cover` for notch-safe rendering.
- Verified: images load on all three surfaces (public shop, POS, inventory);
  broken URLs correctly fall back to "No image"; category bar works on 390px
  mobile and 1440px desktop; manifest + theme-color reachable.
