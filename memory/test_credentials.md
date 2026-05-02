# Dukani – Test Credentials

## Seeded (via `POST /api/dev/seed`)

| Role         | Email                      | Password       |
|--------------|----------------------------|----------------|
| Owner        | owner.seed@dukani.dev      | Dukani@2026    |
| Shopkeeper A | keeper.a@dukani.dev        | Keeper@2026    |
| Shopkeeper B | keeper.b@dukani.dev        | Keeper@2026    |
| Customer     | customer.seed@dukani.dev   | Customer@2026  |

Seeded shops: "Seed Main Shop" → Keeper A, "Seed Branch Shop" → Keeper B. 
Seeded products: Seed Phone (KES 300), Seed Tablet (KES 450).

## Role capabilities verified

- **Owner login** → `/owner` Owner Dashboard (Shops, Shopkeepers, Assignments, Revenue cards) + sidebar for Shops / Shopkeepers / Assignments / Sales / POS Access / Inventory / Alerts. Can register freshly; can also register a brand-new owner from the Register page.
- **Owner → Assignments tab**: Add Shopkeeper (creates a shopkeeper tied to this owner via the new `POST /api/owner/shopkeepers` endpoint), select a shop, click Assign/Unassign. Assignment status updates in real time.
- **Shopkeeper login** → `/shopkeeper` Shopkeeper Dashboard listing their assigned shops (via `GET /api/shop/my`). Click "Enter POS →" to open Cashier POS scoped to that shop.
- **Customer login / Register as customer** → Customer Marketplace (Products / Cart / Orders) with public catalog.

Backend URL (preview): https://06ba33fe-b785-40d0-b7e3-4cee8378a2be.preview.emergentagent.com
