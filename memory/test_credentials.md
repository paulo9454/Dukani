# Dukani – Test Credentials (latest)

Seed (via `POST /api/dev/seed`):

| Role         | Email                      | Password       |
|--------------|----------------------------|----------------|
| Owner        | owner.seed@dukani.dev      | Dukani@2026    |
| Shopkeeper A | keeper.a@dukani.dev        | Keeper@2026    |
| Shopkeeper B | keeper.b@dukani.dev        | Keeper@2026    |
| Customer     | customer.seed@dukani.dev   | Customer@2026  |

Seeded shops: "Seed Main Shop" (Keeper A), "Seed Branch Shop" (Keeper B). 2 products pre-loaded.

## Verified end-to-end flows (all working)

**Owner Panel sidebar**: Dashboard, Shops, Shopkeepers, Assignments, Inventory, Sales, POS Access, Alerts.

1. **Register as owner** → lands on Owner Dashboard.
2. **Shops tab** → create a shop (auto 14-day free POS trial). Delete works.
3. **Shopkeepers / Assignments tab** → Add Shopkeeper (name, email, password), select a shop, Assign / Unassign. Current Assignments list shows name + email.
4. **Inventory tab** → Shop picker + Launch POS button. Add Product modal (name, category, image, buying unit piece/packet/dozen, buying qty, total buying cost → auto cost-per-unit, selling price, wholesale price, low-stock threshold). Edit + Restock (weighted buying price).
5. **Sales tab** → Revenue / Orders / Shops / Avg Order cards + Sales by Shop table + Recent Transactions after POS checkouts.
6. **POS Access tab** → shows each shop's plan and POS/Online status + Launch POS button (owner can use POS directly).
7. **Alerts tab** → low stock notifications via `/api/notifications/stock`.
8. **Shopkeeper logs in** → `/shopkeeper` shows their assigned shops + Enter POS.
9. **POS** (owner or shopkeeper) → search products, Retail/Wholesale toggle, cart, Cash/M-Pesa/Credit payment, tax/discount, checkout → receipt.
10. **Customer register** → Marketplace (public products, cart, orders).

Backend URL: https://06ba33fe-b785-40d0-b7e3-4cee8378a2be.preview.emergentagent.com
