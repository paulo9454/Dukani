# Dukani – PRD (Deployment Setup on Emergent)

## Original Problem Statement

## Session: Feb 2026 — Three-pack: online recovery, creditor module, self-heal
- **#1 — Stuck "shop unavailable" recovery** (production issue): a paying
  client's shop link kept saying "this shop is not currently selling
  online" even after Paystack confirmed and the owner panel showed online
  enabled. Two-pronged fix:
  - `routers/public.py:_online_eligible` now also consults the
    `subscriptions` collection (paid + pos_online) as a final fallback,
    AND **self-heals** the shop document so the next request hits the
    fast path. No more dark storefronts when activation drift happens.
  - New `POST /api/owner/shops/{shop_id}/recover-activation` endpoint.
    Owner can paste a Paystack reference (or leave blank to auto-find
    their latest paid pos_online subscription) to re-run idempotent
    activation. Hard-blocks repurposing another shop's payment with
    `403 Not allowed`.
  - Frontend "🛟 Already paid? Recover" button on every shop card.
- **#2 — Creditor module** (POS + Owner panel + Shopkeeper):
  - New reusable `CreditorsPanel` component used in:
    - Owner sidebar tab `💳 Creditors` (cross-shop list with shop filter).
    - POS `💳 Creditors` button → modal with shop-scoped list.
  - List shows name, phone, credit limit, balance, total outstanding.
  - Two actions per row:
    - **💵 Cash paid** — `POST /api/credit-customers/{id}/payment` with
      `method=cash`, instantly reduces balance.
    - **📲 Send M-Pesa** — `POST /api/credit-customers/{id}/payment-stk` →
      Daraja STK to customer phone → balance auto-reduces on callback
      success (callback handler now decrements via the new
      `payment_type=credit_settlement` + `credit_ledger_id` link).
  - `GET /api/credit-customers/{id}/history` returns last 50 events.
- **#3 — Owner-without-shopkeeper sales**: already supported in
  `pos.py:resolve_shop()` — owner role passes any owned shop_id with no
  assignment check. Verified, no code change needed.
- Verified end-to-end with curl: recover w/o payment (404 helpful),
  recover w/ valid ref (activated + plan flipped), public-shop self-heal
  (200 + shop doc auto-fix), credit cash payment (balance -500), credit
  STK callback success (balance -1000, method=mpesa_stk).

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

## Session: Feb 2026 — Manual M-Pesa fallback
- **Backend**:
  - `shops` doc extended with `mpesa_till_number`, `mpesa_paybill_number`,
    `mpesa_account_name`. `GET/PUT /api/shop/{id}/mpesa-settings` reads and
    writes all three.
  - `GET /api/public/shop/{slug}` now returns `mpesa_configured` (boolean)
    and the three customer-safe manual fields. Secrets are never exposed.
  - New `POST /api/orders/{id}/mark-paid-manual` — phone-match authorised,
    flips `payment_method=mpesa_manual`, `payment_status=pending_confirmation`,
    stamps `mpesa_manual_claimed_at`. No-ops if already paid.
- **Frontend**:
  - `CheckoutModal` now receives `shop` prop and renders methods
    dynamically: "🟢 M-Pesa (Instant)" appears only if `mpesa_configured`;
    "💵 Pay manually (M-Pesa)" always; "💵 Pay on pickup" always.
  - Manual flow shows a new view with InfoRow tiles for Till / PayBill /
    Reference / Amount — each with a one-tap Copy button. If the shop has
    NO M-Pesa details, the fallback copy asks the customer to wait for the
    owner to reach out on their phone number.
  - "I have paid" button calls the new endpoint and flips to a green
    "We will confirm your payment shortly." banner.
  - `MPesaSettingsModal` got a new "💵 Manual M-Pesa (fallback)" block with
    Till / PayBill / Account inputs next to the Daraja config.
- **Verified** via curl + Playwright:
  - Public shop exposes the new flags ✓
  - PUT saves till_number + account_name ✓
  - mark-paid-manual: right phone → 200, wrong phone → 403 ✓
  - Track shows `payment_method=mpesa_manual, payment_status=pending_confirmation` ✓
  - Checkout on Daraja-less shop hides STK, shows manual modal with
    contact-owner fallback copy ✓
- **STK flow & callback untouched.**

## Session: Feb 2026 — Paystack iframe fix + /payment-success route
- **Root cause of "checkout.paystack.com refused to connect"**: the preview
  renders the app in an iframe, and `window.location.href = paystack_url`
  tried to navigate the iframe. Paystack sends `X-Frame-Options: DENY` so
  the iframe refuses. Fixed with `utils/navigate.js::redirectTop()` which
  uses `window.top.location` or `window.open(url, "_top")` to break out of
  the frame. Used everywhere we kick off Paystack (`Shops.jsx`, `PlanBadge`).
- **New public route `/payment-success`**: Paystack-safe landing page,
  UI-only, calls `/paystack/verify` as a hint but activation is STILL
  webhook-owned. Shows Confirming / Success / No-reference states with a
  Continue button that goes back to `/owner` (or `/` if signed out).
- **Subscribe callback_url now points to `/payment-success`** instead of
  `/owner?sub=verify`.
- **Audit**: confirmed NO `/api/payments/callback` endpoint exists in code
  — the dashboard URL that was set to that is a Paystack dashboard config
  issue. Correct URLs documented:
  - Webhook: `https://<domain>/api/payments/paystack/webhook`
  - Callback: `https://<domain>/payment-success`
- **Logging added**: `logger.info` on initialize success (reference + shop +
  plan + amount), webhook receive (event + reference), and the existing
  `subscription activated shop=… plan=… reference=…`.
- Verified: `/payment-success?reference=…` renders 200, reference echoed,
  Continue button present; webhook still 401s unsigned.

## Session: Feb 2026 — "Your plan" header badge
- New `components/PlanBadge.jsx` wired into the owner/admin header.
- Reads `/api/owner/shops`, picks the most-urgent shop (expired → <7d →
  <14d → healthy → none) and renders a color-coded chip plus a one-tap
  Activate/Renew button that hits `/api/owner/shops/{id}/subscribe` and
  redirects to Paystack.
- Palette: green (healthy) · amber (<=14d) · red (<=7d or expired) · gray
  (no plan). Hidden entirely when the owner has zero shops.
- Verified live: chip + Activate button render in header for an owner
  with no active plan; lint clean.

## Session: Feb 2026 — Paystack subscription activation wired end-to-end
- **Free activation removed**: `/api/owner/shops/{id}/subscribe` no longer
  flips `subscription_plan`. It now builds a Paystack init with metadata
  `{shop_id, subscription_plan, payment_type: "subscription", user_id}` and
  returns `authorization_url` + reference. Admins can still override with
  `admin_override: true` for internal use.
- **Pricing**: `SUBSCRIPTION_PRICES_KES = {pos: 500, pos_online: 1000}` in
  `owner.py`. Currency locked to KES. Amount converted to kobo by the
  Paystack initialize helper.
- **`_activate_subscription()`** helper in `payments.py`: idempotent flip of
  `subscription_plan`, `online_enabled`, `is_online_enabled`,
  `subscription_status="active"`, `subscription_start`, `subscription_end`
  (30-day), `subscription_last_reference`. Also upserts `subscriptions`
  collection. Tagged with `subscription_activated_at` on the payment doc
  so replay never re-activates.
- **Webhook** (`POST /paystack/webhook`): after HMAC-SHA512 verify +
  idempotent settle, reads `data.metadata`, backfills the payment record
  with any fields it didn't have (shop_id / plan / type) and calls
  `_activate_subscription` on success. Failure events leave the shop
  unchanged.
- **Verify** (`POST /paystack/verify`): also calls `_activate_subscription`
  so a customer returning from Paystack gets instant activation even if
  the webhook is slow/offline. Response now carries
  `subscription_activated: bool`.
- **Frontend**:
  - `Shops.jsx` "Activate Online Store" button now calls the new
    subscribe endpoint and redirects to `authorization_url`.
  - `App.jsx` one-shot `?reference=…` handler auto-calls
    `/paystack/verify` on return from Paystack, toasts success, refreshes.
- **Verified live** (via raw `PAYSTACK_SECRET_KEY` HMAC signed requests):
  - subscribe → `activated:false` + Paystack URL, shop untouched ✓
  - signed `charge.success` webhook → shop activated (30-day window) ✓
  - replay same reference → `idempotent:true`, no double activation ✓
  - signed `charge.failed` webhook → shop untouched ✓
  - unsigned webhook → `401` ✓
  - verify with fake reference → Paystack says failed → no activation ✓

## Session: Feb 2026 — PWA install + Paystack production readiness audit
- New `public/sw.js` — minimal service worker (shell cache + SWR for
  `/api/static/*`), registered from `utils/pwa.js` on window load. Satisfies
  Chrome's installability criteria (manifest + fetch-handling SW).
- New `utils/pwa.js` — captures `beforeinstallprompt`, exposes
  `promptInstall()`, `isStandalone()`, `isIos()`, and emits
  `dukayko:install-available` / `…-cleared` CustomEvents.
- New `components/InstallButton.jsx` — hides when standalone, shows native
  prompt on Android/Chrome, shows iOS "Share → Add to Home Screen" tooltip
  on iOS Safari. Placed in Landing header + Owner header.
- Paystack production audit: **LIVE keys loaded and endpoints working**.
  `POST /paystack/initialize` returns a real `pk_live_` public key and a
  reachable `https://checkout.paystack.com/<ref>` URL. Webhook enforces
  HMAC-SHA512 (unsigned → 401). Verify endpoint hits
  `https://api.paystack.co/transaction/verify/{ref}`. Idempotent via
  `_idempotent_settle`. Keys survive `.env` being empty because
  `load_dotenv(override=False)` preserves Emergent-protected env vars.
- **Gap flagged (not fixed):** `/paystack/webhook` does not flip shop
  `subscription_plan` on success — `/api/owner/shops/{id}/subscribe` still
  activates plans without payment. Needs webhook metadata hook +
  payment-gated subscribe endpoint (documented for next session).

## Session: Feb 2026 — One-tap WhatsApp sharing
- New `utils/share.js` — `shareOnWhatsApp(slug)` opens `wa.me/?text=...` in a
  new tab with the exact template: "Check out my shop 🛒\n{url}\n\nOrder
  easily and pay with M-Pesa." Popup-blocked fallback to same-tab nav.
  `copyShopLink(slug)` uses Clipboard API with `execCommand` fallback for
  insecure contexts / older Android browsers.
- New `utils/toast.js` — dependency-free toast via a single DOM host node,
  auto-dismiss 2s, `success` variant for green confirmation.
- `Shops.jsx`: prominent 44 px "📲 Share on WhatsApp" button (WhatsApp brand
  green `#25D366`) on every shop card that has a slug. Copy link restyled to
  match with its own toast. `alert()` on online-store activation replaced
  with a success toast that invites the owner to share.
- Verified: button height 44 px, emoji 🛒 (U+1F6D2) preserved through
  encodeURIComponent, wa.me URL correct with shop slug, lint clean.

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

## Session: Feb 2026 — P0 Shopkeeper "Not assigned" checkout fix
- **Root cause**: Two parallel sources of truth for shopkeeper → shop linkage.
  Owner assign/unassign only wrote to the `assignments` collection, but
  `pos.py:resolve_shop()`, `marketplace.py`, `credit.py`, `damaged_stock.py`,
  `categories.py`, `credit_history.py`, `notifications.py` and the seed
  function all read from `users.assigned_shop_ids` — which stayed empty,
  producing "No shop assigned" / "Shopkeeper not assigned" 403s on every
  POS checkout, credit op, marketplace order, etc.
- **Fix**: Made `db.assignments` the canonical store.
  - New helper `core/deps.get_assigned_shop_ids(user_id)` reads live from
    the `assignments` collection.
  - All seven readers above now call the helper instead of the stale user
    field.
  - `routers/auth.py:_user_response` resolves `assigned_shop_ids` from the
    helper for shopkeepers so the frontend (POS shop picker, sidebar)
    always reflects the latest owner action without re-login.
  - Both `routers/assignments.py` and `routers/owner.py` assign/unassign
    endpoints now `$addToSet`/`$pull` on `users.assigned_shop_ids` to keep
    the denormalized cache in sync (defensive).
  - `routers/owner.py:delete_shop` also `$pull`s the shop id from every
    keeper's array.
  - `services/seed.py` upserts users by email (correctly resolves the
    real `_id` after upsert) and also writes the canonical `assignments`
    rows — fixes seed run #2+ orphaning the assignments to a fresh UUID
    that didn't match the existing keeper docs.
  - Ran one-time backfill: 10/11 existing shopkeepers had drift, all
    synced from `assignments` → `users.assigned_shop_ids`.
- **Verified end-to-end via curl on the live preview URL**:
  - `keeper.a@dukani.dev` login → `assigned_shop_ids` correctly populated.
  - `GET /api/shop/my` returns "Seed Main Shop" only.
  - `POST /api/orders/checkout` (cash) succeeds → receipt with order_id +
    payment_status=confirmed.
  - `keeper.b@dukani.dev` checkout into A's shop → `403 Not allowed`.
- **Known follow-up (NOT touched per user instruction to verify P0 first)**:
  - `GET /api/products?shop_id=X` is not scoped to the caller's
    assignments/ownership. Shopkeeper B can read shopkeeper A's products
    via direct shop_id query (read-only — checkout still blocks). Should
    be tightened in the next tenant-isolation sweep.

## Session: Feb 2026 — P0.5 products tenant scope + P1 manual M-Pesa confirm/reject
- **P0.5 — products endpoint tenant leak**: `GET /api/products?shop_id=X`
  used to accept any shop_id from any caller. Now enforces:
  - Shopkeeper: must have `shop_id` in their live `assignments`. Without
    `shop_id`, query is auto-scoped to all assigned shops.
  - Owner / partner: `shop_id` (if provided) must be owned by them.
    Without it, query is auto-scoped to their own shops.
  - Admin: unchanged.
- **P1 — manual M-Pesa confirm/reject** (closes the loop on
  `mark-paid-manual` claims):
  - `POST /api/orders/{id}/confirm-payment` — owner-of-shop only, only when
    `payment_status == "pending_confirmation"`. Sets `payment_status=success`,
    `status=paid`, `paid_at=now`, plus `manually_confirmed_by/at` audit fields.
  - `POST /api/orders/{id}/reject-payment` — same auth + state guard, sets
    `payment_status=failed`, stores optional `manual_rejection_reason` and
    `manually_rejected_by/at`.
  - Cross-tenant: a different owner gets `403 Not allowed`.
  - Re-confirm/re-reject: `400` (state guard).
  - Frontend `Orders.jsx`: ✅ Confirm payment + ❌ Reject payment buttons
    appear ONLY when `payment_status === "pending_confirmation"`. Reject
    prompts for an optional reason. Payment badge now renders
    `pending_confirmation → "awaiting confirm"` in violet.
- **Verified via curl**:
  - keeper.a → A's products: 200 (1 product)
  - keeper.b → A's products: 403 "Not allowed for this shop"
  - keeper.a no shop_id: scoped to assigned shop only
  - owner → unowned shop_id: 403 "Not your shop"
  - owner no shop_id: scoped to owned shops only
  - claim → confirm: success/paid + paid_at stamped
  - re-confirm: 400 "Only orders awaiting manual confirmation can be confirmed"
  - claim → reject (with reason): failed + reason persisted
  - 2nd owner → confirm/reject: 403 "Not allowed"
  - 2nd owner /api/orders & /api/products: empty (correct tenant isolation)
## Session: Feb 2026 — Landing page dual-shop POS + Online showcase
- Replaced the single Mkenya Shop browser-frame preview with a new
  "Run your shop. Sell online." section that visually proves Dukayko is
  both a POS and an online storefront in one product.
- New `DualShopCard` component renders two side-by-side panels per shop:
  - **Left (POS view)**: dark cashier panel with line-item rows, qty
    column, KES total, and Cash + M-Pesa Charge buttons.
  - **Right (Online customer view)**: light panel with a faux URL bar
    (`dukayko.com/shop/{slug}`), 2x2 product grid with photos, prices,
    and Add to cart buttons.
- On mobile the panels auto-stack (POS first, then Online) via
  `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`.
- Two demo shops, each with its own product set, supporting copy, and
  CTA to `/shop/{slug}`:
  1. **ElectroMart Kenya** (Electronics · Nairobi CBD) — Samsung 43" Smart
     TV, LG 32" LED TV, Sony Home Theatre, Extension Cable. Photos sourced
     from Pexels CDN (verified browser-loadable; Unsplash was blocking the
     iframe).
  2. **Urban Heels & Fashion** (Ladies Fashion · Westlands) — uses the
     four user-uploaded product photos (Rose Embroidered Sneakers,
     Brown Suede Loafers, Black Leather Backpack, Canvas Messenger Bag).
- Added a `loading="eager"` prop on `ProductImage` so prominent
  above-the-fold demos don't sit in IntersectionObserver lazy-load
  purgatory.
- Test IDs added: `demo-shop-electro-mart`, `demo-shop-urban-heels`,
  and `demo-shop-{slug}-cta` per spec.
- Backend, checkout, payments untouched per spec.

## Session: Feb 2026 — Deploy hardening (root cause: misconfigured env var)
- **Root cause of deploy crash** (`ValueError: invalid literal for int() with
  base 10: 'sk_live_...'`): in the user's deploy console, a Paystack secret
  was pasted into the wrong env-var slot (one of `ACCESS_TOKEN_EXPIRE_MINUTES`,
  `REFRESH_TOKEN_EXPIRE_MINUTES`, or `SMTP_PORT`). At import time
  `int(os.getenv(...))` blew up before the app could serve a request.
- **Fix**: added `core/settings.py::_int_env(name, default)` and a try/except
  around `SMTP_PORT` parsing in `services/email_service.py`. Bad ints now
  fall back to the default and log a clear, named ERROR ("Env var X='sk_live_…'
  is not a valid integer — falling back to N. Check your deployment
  configuration."). Backend boots even with malformed numeric env vars.
- **Reproduced + verified**: launched backend with the bad value injected;
  settings module loaded successfully and emitted the new warning.
- **Deploy build context**: removed `.env` and `backend/.env` entries from
  `/app/.gitignore` so deployment image actually contains the file.
- **Performance pass** (deployment_agent flags):
  - `marketplace.py` orders queries → `.sort("created_at",-1).limit(200)`.
  - `public.py` home/products/shops/nearby_shops → bounded with `.limit(...)`,
    plus the N+1 in `/products` collapsed into a single `find({_id:{$in:…}})`
    shop lookup.
- **What the user must do in the deploy console**: open the misset env var
  and replace its value back to the correct integer (defaults: 30 / 10080 /
  587). The Paystack secret only belongs in `PAYSTACK_SECRET_KEY`.

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
