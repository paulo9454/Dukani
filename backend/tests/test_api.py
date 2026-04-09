import os
os.environ["TESTING"] = "1"
os.environ["DB_NAME"] = "dukani_test"

from fastapi.testclient import TestClient
from backend.server import app
from backend.db.mongo import reset_db, get_db
from backend.middleware.rate_limit import reset_rate_limits

client = TestClient(app)


def auth_headers(email: str, role: str):
    register = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Passw0rd!", "full_name": role, "role": role},
    )
    token = register.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def setup_function():
    reset_db()
    reset_rate_limits()


def test_auth_and_shop_creation_and_assignment():
    owner_h = auth_headers("owner@dukani.dev", "owner")
    shopkeeper_h = auth_headers("keeper@dukani.dev", "shopkeeper")

    r = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Main", "subscription_plan": "online"})
    assert r.status_code == 200
    shop_id = r.json()["_id"]

    db = get_db()
    staff_id = db.users.find_one({"email": "keeper@dukani.dev"})["_id"]
    assign = client.post(f"/api/dashboard/shops/{shop_id}/assign/{staff_id}", headers=owner_h)
    assert assign.status_code == 200
    assert shop_id in assign.json()["assigned_shop_ids"]

    vendor_dash = client.get("/api/dashboard/vendor", headers=shopkeeper_h)
    assert vendor_dash.status_code == 200


def test_stock_checkout_and_idempotency():
    owner_h = auth_headers("owner2@dukani.dev", "owner")
    customer_h = auth_headers("cust@dukani.dev", "customer")

    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Shop", "subscription_plan": "online"}).json()
    product = client.post(
        "/api/products",
        headers=owner_h,
        json={"shop_id": shop["_id"], "name": "Phone", "price": 100, "stock": 5, "description": "", "is_public": True},
    ).json()

    add = client.post("/api/customer/cart", headers=customer_h, json={"product_id": product["_id"], "qty": 2})
    assert add.status_code == 200

    checkout_payload = {"idempotency_key": "idem-12345", "payment_provider": "Stripe"}
    first = client.post("/api/customer/checkout", headers=customer_h, json=checkout_payload)
    second = client.post("/api/customer/checkout", headers=customer_h, json=checkout_payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["_id"] == second.json()["_id"]


def test_subscription_gating_pos_blocks_online_and_legacy_allows():
    owner_h = auth_headers("owner3@dukani.dev", "owner")
    customer_h = auth_headers("cust2@dukani.dev", "customer")

    pos_shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "POS", "subscription_plan": "pos"}).json()
    product = client.post(
        "/api/products",
        headers=owner_h,
        json={"shop_id": pos_shop["_id"], "name": "Tablet", "price": 50, "stock": 3, "description": "", "is_public": True},
    ).json()
    client.post("/api/customer/cart", headers=customer_h, json={"product_id": product["_id"], "qty": 1})

    blocked = client.post("/api/customer/checkout", headers=customer_h, json={"idempotency_key": "idem-pos-1", "payment_provider": "Stripe"})
    assert blocked.status_code == 403

    legacy_shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Legacy", "subscription_plan": "legacy"}).json()
    db = get_db()
    db.subscriptions.delete_many({"shop_id": legacy_shop["_id"]})

    p2 = client.post(
        "/api/products",
        headers=owner_h,
        json={"shop_id": legacy_shop["_id"], "name": "Watch", "price": 20, "stock": 2, "description": "", "is_public": True},
    ).json()
    client.delete(f"/api/customer/cart/{product['_id']}", headers=customer_h)
    client.post("/api/customer/cart", headers=customer_h, json={"product_id": p2["_id"], "qty": 1})

    allowed = client.post("/api/customer/checkout", headers=customer_h, json={"idempotency_key": "idem-leg-1", "payment_provider": "Stripe"})
    assert allowed.status_code == 200


def test_shopkeeper_pos_flow_and_customer_order_isolation():
    owner_h = auth_headers("owner4@dukani.dev", "owner")
    shopkeeper_h = auth_headers("keeper2@dukani.dev", "shopkeeper")
    c1_h = auth_headers("c1@dukani.dev", "customer")
    c2_h = auth_headers("c2@dukani.dev", "customer")

    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Ops", "subscription_plan": "online"}).json()
    db = get_db()
    keeper_id = db.users.find_one({"email": "keeper2@dukani.dev"})["_id"]
    client.post(f"/api/dashboard/shops/{shop['_id']}/assign/{keeper_id}", headers=owner_h)

    product = client.post("/api/products", headers=owner_h, json={"shop_id": shop["_id"], "name": "Mouse", "price": 10, "stock": 9, "description": ""}).json()
    pos = client.post(
        "/api/orders/checkout",
        headers=shopkeeper_h,
        json={"shop_id": shop["_id"], "items": [{"product_id": product["_id"], "qty": 2}], "payment_provider": "M-Pesa", "idempotency_key": "idem-pos-keeper"},
    )
    assert pos.status_code == 200

    client.post("/api/customer/cart", headers=c1_h, json={"product_id": product["_id"], "qty": 1})
    client.post("/api/customer/checkout", headers=c1_h, json={"idempotency_key": "idem-c1", "payment_provider": "Stripe"})
    r1 = client.get("/api/orders", headers=c1_h)
    r2 = client.get("/api/orders", headers=c2_h)
    assert len(r1.json()) == 1
    assert len(r2.json()) == 0


def test_owner_can_create_multiple_shops_and_assign_shopkeeper_to_each():
    owner_h = auth_headers("owner5@dukani.dev", "owner")
    shopkeeper_h = auth_headers("keeper3@dukani.dev", "shopkeeper")

    s1 = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Branch A", "subscription_plan": "online"}).json()
    s2 = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Branch B", "subscription_plan": "online"}).json()

    db = get_db()
    keeper_id = db.users.find_one({"email": "keeper3@dukani.dev"})["_id"]
    a1 = client.post(f"/api/dashboard/shops/{s1['_id']}/assign/{keeper_id}", headers=owner_h)
    a2 = client.post(f"/api/dashboard/shops/{s2['_id']}/assign/{keeper_id}", headers=owner_h)
    assert a1.status_code == 200
    assert a2.status_code == 200

    assigned = set(a2.json()["assigned_shop_ids"])
    assert s1["_id"] in assigned and s2["_id"] in assigned

    shops_view = client.get("/api/dashboard/shops", headers=shopkeeper_h)
    assert shops_view.status_code == 200
    ids = {s["_id"] for s in shops_view.json()}
    assert s1["_id"] in ids and s2["_id"] in ids


def test_credit_checkout_creates_ledger_and_history():
    owner_h = auth_headers("owner6@dukani.dev", "owner")
    customer_h = auth_headers("credit@dukani.dev", "customer")

    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Credit Shop", "subscription_plan": "online"}).json()
    product = client.post("/api/products", headers=owner_h, json={"shop_id": shop["_id"], "name": "TV", "price": 300, "stock": 4, "description": ""}).json()
    client.post("/api/customer/cart", headers=customer_h, json={"product_id": product["_id"], "qty": 1})

    checkout = client.post("/api/customer/checkout", headers=customer_h, json={"idempotency_key": "idem-credit-1", "payment_provider": "Ledger", "payment_method": "credit"})
    assert checkout.status_code == 200

    ledgers = client.get("/api/credit-customers", headers=owner_h)
    assert ledgers.status_code == 200
    assert len(ledgers.json()) == 1

    history = client.get("/api/credit-payments/history", headers=owner_h)
    assert history.status_code == 200
    assert len(history.json()) >= 1


def test_damaged_stock_reduces_inventory_and_updates_dashboard():
    owner_h = auth_headers("owner7@dukani.dev", "owner")
    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Damage Shop", "subscription_plan": "online"}).json()
    product = client.post("/api/products", headers=owner_h, json={"shop_id": shop["_id"], "name": "Bottle", "price": 5, "stock": 10, "description": ""}).json()

    damage = client.post("/api/damaged-stock", headers=owner_h, json={"product_id": product["_id"], "qty": 2, "reason": "breakage"})
    assert damage.status_code == 200

    product_after = client.get("/api/products").json()
    row = [p for p in product_after if p["_id"] == product["_id"]][0]
    assert row["stock"] == 8

    dashboard = client.get("/api/dashboard/vendor", headers=owner_h)
    assert dashboard.json()["total_damaged_items"] >= 2


def test_suppliers_owner_only_and_linking_products():
    owner_h = auth_headers("owner8@dukani.dev", "owner")
    shopkeeper_h = auth_headers("keeper8@dukani.dev", "shopkeeper")
    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Supply Shop", "subscription_plan": "online"}).json()
    product = client.post("/api/products", headers=owner_h, json={"shop_id": shop["_id"], "name": "Cable", "price": 12, "stock": 20, "description": ""}).json()

    denied = client.post("/api/suppliers", headers=shopkeeper_h, json={"name": "No Access"})
    assert denied.status_code == 403

    supplier = client.post("/api/suppliers", headers=owner_h, json={"name": "Acme Supplies", "contact": "acme@example.com"})
    assert supplier.status_code == 200

    linked = client.put(f"/api/suppliers/{supplier.json()['_id']}/link-product/{product['_id']}", headers=owner_h)
    assert linked.status_code == 200
    assert product["_id"] in linked.json()["product_ids"]


def test_stock_notifications_endpoint_returns_alerts():
    owner_h = auth_headers("owner9@dukani.dev", "owner")
    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Alert Shop", "subscription_plan": "online"}).json()
    client.post("/api/products", headers=owner_h, json={"shop_id": shop["_id"], "name": "Low Item", "price": 7, "stock": 1, "description": "", "low_stock_threshold": 5})

    alerts = client.get("/api/notifications/stock", headers=owner_h)
    assert alerts.status_code == 200
    assert any(a["type"] == "low_stock" for a in alerts.json())


def test_seed_endpoint_creates_multi_shop_and_allocations():
    seeded = client.post("/api/dev/seed")
    assert seeded.status_code == 200
    payload = seeded.json()
    assert payload["owner_email"] == "owner.seed@dukani.dev"

    login = client.post("/api/auth/login", json={"email": "owner.seed@dukani.dev", "password": "Passw0rd!"})
    assert login.status_code == 200
    owner_h = {"Authorization": f"Bearer {login.json()['access_token']}"}

    shops = client.get("/api/dashboard/shops", headers=owner_h)
    assert shops.status_code == 200
    assert len(shops.json()) >= 2


def test_owner_bulk_assignment_and_assignment_view():
    owner_h = auth_headers("owner10@dukani.dev", "owner")
    k1_h = auth_headers("keeper10a@dukani.dev", "shopkeeper")
    k2_h = auth_headers("keeper10b@dukani.dev", "shopkeeper")

    _ = k1_h, k2_h
    shop = client.post("/api/dashboard/shops", headers=owner_h, json={"name": "Bulk Shop", "subscription_plan": "online"}).json()
    db = get_db()
    k1 = db.users.find_one({"email": "keeper10a@dukani.dev"})["_id"]
    k2 = db.users.find_one({"email": "keeper10b@dukani.dev"})["_id"]

    bulk = client.post(f"/api/dashboard/shops/{shop['_id']}/assignments/bulk", headers=owner_h, json={"staff_ids": [k1, k2]})
    assert bulk.status_code == 200
    assert len(bulk.json()["updated"]) == 2

    view = client.get(f"/api/dashboard/shops/{shop['_id']}/assignments", headers=owner_h)
    assert view.status_code == 200
    ids = {u["_id"] for u in view.json()["shopkeepers"]}
    assert k1 in ids and k2 in ids


def test_refresh_token_flow():
    reg = client.post('/api/auth/register', json={"email": "refresh@dukani.dev", "password": "Passw0rd!", "full_name": "Refresh", "role": "customer"})
    assert reg.status_code == 200
    refresh_token = reg.json()["refresh_token"]
    refreshed = client.post('/api/auth/refresh', json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


def test_rate_limiting_on_login():
    for _ in range(5):
        r = client.post('/api/auth/login', json={"email": "none@dukani.dev", "password": "wrong"})
        assert r.status_code == 401
    limited = client.post('/api/auth/login', json={"email": "none@dukani.dev", "password": "wrong"})
    assert limited.status_code == 429


def test_idempotency_header_for_customer_checkout():
    owner_h = auth_headers('owner-header@dukani.dev', 'owner')
    customer_h = auth_headers('cust-header@dukani.dev', 'customer')
    shop = client.post('/api/dashboard/shops', headers=owner_h, json={"name": "Header Shop", "subscription_plan": "online"}).json()
    product = client.post('/api/products', headers=owner_h, json={"shop_id": shop['_id'], "name": "Headset", "price": 25, "stock": 5, "description": ""}).json()
    client.post('/api/customer/cart', headers=customer_h, json={"product_id": product['_id'], "qty": 1})

    h = {**customer_h, 'Idempotency-Key': 'hdr-1234'}
    p = {"payment_provider": "Stripe", "payment_method": "card"}
    first = client.post('/api/customer/checkout', headers=h, json=p)
    second = client.post('/api/customer/checkout', headers=h, json=p)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()['_id'] == second.json()['_id']


def test_mpesa_validation_requires_meta():
    owner_h = auth_headers('owner-mpesa@dukani.dev', 'owner')
    customer_h = auth_headers('cust-mpesa@dukani.dev', 'customer')
    shop = client.post('/api/dashboard/shops', headers=owner_h, json={"name": "Mpesa Shop", "subscription_plan": "online"}).json()
    product = client.post('/api/products', headers=owner_h, json={"shop_id": shop['_id'], "name": "Charger", "price": 10, "stock": 5, "description": ""}).json()
    client.post('/api/customer/cart', headers=customer_h, json={"product_id": product['_id'], "qty": 1})
    bad = client.post('/api/customer/checkout', headers=customer_h, json={"idempotency_key": "mpsa-1", "payment_provider": "M-Pesa", "payment_method": "mpesa"})
    assert bad.status_code == 400
