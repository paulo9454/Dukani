"""End-to-end coverage for the new product types.

Covers all three modes (standard / unit_based / variant), the atomic
stock guard, restoration on cancellation, and the negative paths the
spec calls out (overselling, missing variant, missing unit choice).
"""
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.server import app
from backend.db.mongo import get_db


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def owner_token():
    # Re-seed once for the whole module + login once. Repeated logins
    # within seconds trip the brute-force lockout.
    from fastapi.testclient import TestClient
    from backend.server import app
    c = TestClient(app)
    c.post("/api/dev/seed")
    res = c.post(
        "/api/auth/login",
        json={"email": "owner.seed@dukani.dev", "password": "Dukani@2026"},
    )
    return res.json()["access_token"]


@pytest.fixture
def shop_id():
    db = get_db()
    return db.shops.find_one({"name": "Seed Main Shop"})["_id"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create(client, token, **fields):
    return client.post(
        "/api/products",
        data=fields,
        headers=_auth(token),
    )


# ─────────────────────────────────────────────────────────────
# CREATE — three product types
# ─────────────────────────────────────────────────────────────

def test_create_standard_unchanged(client, owner_token, shop_id):
    res = _create(
        client, owner_token,
        shop_id=shop_id, name="Bread", price=60, stock=10,
    )
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["product_type"] == "standard"
    assert p["stock"] == 10


def test_create_unit_based_normalizes_to_grams(client, owner_token, shop_id):
    units = [
        {"label": "250g", "quantity": 250, "price": 45},
        {"label": "500g", "quantity": 500, "price": 90},
        {"label": "1kg",  "quantity": 1000, "price": 180},
    ]
    res = _create(
        client, owner_token,
        shop_id=shop_id, name="Sugar", price=180,
        product_type="unit_based",
        base_unit="kg",
        base_stock_quantity=50,            # 50kg → 50000g
        selling_units=json.dumps(units),
    )
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["product_type"] == "unit_based"
    assert p["base_unit"] == "kg"
    assert p["base_stock_quantity"] == 50000
    assert len(p["selling_units"]) == 3


def test_create_variant_product(client, owner_token, shop_id):
    variants = [
        {"name": "Small", "stock": 20, "price": 250},
        {"name": "Medium", "stock": 35, "price": 300},
        {"name": "Large", "stock": 18, "price": 350},
    ]
    res = _create(
        client, owner_token,
        shop_id=shop_id, name="Diapers",
        product_type="variant",
        variants=json.dumps(variants),
    )
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["product_type"] == "variant"
    assert {v["name"] for v in p["variants"]} == {"Small", "Medium", "Large"}


def test_create_validation_unit_based_requires_units(client, owner_token, shop_id):
    res = _create(
        client, owner_token,
        shop_id=shop_id, name="Bad Sugar",
        product_type="unit_based", base_unit="kg", base_stock_quantity=10,
        selling_units=json.dumps([]),
    )
    assert res.status_code == 400


def test_create_validation_variant_requires_variants(client, owner_token, shop_id):
    res = _create(
        client, owner_token,
        shop_id=shop_id, name="Bad Diapers",
        product_type="variant",
        variants=json.dumps([]),
    )
    assert res.status_code == 400


# ─────────────────────────────────────────────────────────────
# CHECKOUT — stock deduction
# ─────────────────────────────────────────────────────────────

def _checkout(client, token, shop_id, items):
    return client.post(
        "/api/orders/checkout",
        json={"shop_id": shop_id, "items": items, "payment_method": "cash",
              "payment_provider": "cash", "idempotency_key": str(uuid.uuid4())},
        headers={**_auth(token), "Idempotency-Key": str(uuid.uuid4())},
    )


def test_unit_based_sale_reduces_base_stock(client, owner_token, shop_id):
    units = [{"label": "250g", "quantity": 250, "price": 45}]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Sugar Sale Test",
        product_type="unit_based", base_unit="kg", base_stock_quantity=50,
        selling_units=json.dumps(units),
    ).json()["_id"]

    # Sell 1 × 250g — should consume exactly 250g.
    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 1, "unit_label": "250g"},
    ])
    assert res.status_code == 200, res.text

    db = get_db()
    p = db.products.find_one({"_id": pid})
    assert p["base_stock_quantity"] == 50000 - 250


def test_unit_based_sale_multiple_unit_sizes(client, owner_token, shop_id):
    units = [
        {"label": "250g", "quantity": 250, "price": 45},
        {"label": "1kg",  "quantity": 1000, "price": 180},
    ]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Sugar Multi Test",
        product_type="unit_based", base_unit="kg", base_stock_quantity=50,
        selling_units=json.dumps(units),
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 2, "unit_label": "250g"},  # 500g
        {"product_id": pid, "qty": 1, "unit_label": "1kg"},   # 1000g
    ])
    assert res.status_code == 200, res.text

    db = get_db()
    p = db.products.find_one({"_id": pid})
    # 50000 - 500 - 1000 = 48500
    assert p["base_stock_quantity"] == 48500


def test_unit_based_oversell_blocked(client, owner_token, shop_id):
    units = [{"label": "1kg", "quantity": 1000, "price": 180}]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Tiny Sugar",
        product_type="unit_based", base_unit="g", base_stock_quantity=500,
        selling_units=json.dumps(units),
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 1, "unit_label": "1kg"},  # 1000g need
    ])
    assert res.status_code == 400
    assert any(kw in res.text for kw in ["Insufficient stock", "sold out", "left", "remaining"])


def test_unit_based_missing_unit_label_rejected(client, owner_token, shop_id):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="No Label Sugar",
        product_type="unit_based", base_unit="kg", base_stock_quantity=10,
        selling_units=json.dumps([{"label": "1kg", "quantity": 1000, "price": 180}]),
    ).json()["_id"]
    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 1},
    ])
    assert res.status_code == 400
    assert "selling unit" in res.text.lower() or "unit" in res.text.lower()


def test_variant_sale_decrements_only_chosen_variant(client, owner_token, shop_id):
    variants = [
        {"name": "Small",  "stock": 5,  "price": 250},
        {"name": "Medium", "stock": 10, "price": 300},
    ]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="T-shirt",
        product_type="variant", variants=json.dumps(variants),
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 3, "variant_name": "Medium"},
    ])
    assert res.status_code == 200, res.text

    db = get_db()
    p = db.products.find_one({"_id": pid})
    sizes = {v["name"]: v["stock"] for v in p["variants"]}
    assert sizes["Small"] == 5    # untouched
    assert sizes["Medium"] == 7   # 10 - 3


def test_variant_oversell_blocked(client, owner_token, shop_id):
    variants = [{"name": "Small", "stock": 2, "price": 250}]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="T-shirt 2",
        product_type="variant", variants=json.dumps(variants),
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 5, "variant_name": "Small"},
    ])
    assert res.status_code == 400
    assert any(kw in res.text for kw in ["Insufficient stock", "sold out", "left", "remaining"])


def test_variant_missing_name_rejected(client, owner_token, shop_id):
    variants = [{"name": "Small", "stock": 2, "price": 250}]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="T-shirt 3",
        product_type="variant", variants=json.dumps(variants),
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 1},
    ])
    assert res.status_code == 400
    assert "variant" in res.text.lower()


def test_existing_standard_products_still_work(client, owner_token, shop_id):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Bread Old Path",
        price=60, stock=5,
    ).json()["_id"]

    res = _checkout(client, owner_token, shop_id, [
        {"product_id": pid, "qty": 2},
    ])
    assert res.status_code == 200

    db = get_db()
    p = db.products.find_one({"_id": pid})
    assert p["stock"] == 3


# ─────────────────────────────────────────────────────────────
# RESTOCK — product-type aware stock updates
# ─────────────────────────────────────────────────────────────

def test_standard_restock_preserves_legacy_contract(client, owner_token, shop_id):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Bread Restock",
        price=60, buying_price=20, stock=10,
    ).json()["_id"]
    res = client.post(
        "/api/inventory/restock",
        headers=_auth(owner_token),
        json={"product_id": pid, "qty": 5, "buying_price": 30, "total_cost": 150},
    )
    assert res.status_code == 200, res.text
    p = get_db().products.find_one({"_id": pid})
    assert p["stock"] == 15
    assert p["buying_price"] == 23.33
    assert p["price"] == 60


def test_variant_restock_updates_only_selected_variant(client, owner_token, shop_id):
    variants = [
        {"name": "Small", "stock": 5, "buying_price": 100, "price": 200},
        {"name": "Large", "stock": 8, "buying_price": 150, "price": 300},
    ]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Variant Restock",
        product_type="variant", variants=json.dumps(variants),
    ).json()["_id"]
    db = get_db()
    db.products.update_one(
        {"_id": pid}, {"$set": {"variants.0.reserved": 2, "variants.1.reserved": 1}}
    )
    res = client.post(
        "/api/inventory/restock", headers=_auth(owner_token),
        json={"product_id": pid, "variant_name": "Large", "qty": 4,
              "buying_price": 200, "total_cost": 800},
    )
    assert res.status_code == 200, res.text
    saved = db.products.find_one({"_id": pid})
    by_name = {v["name"]: v for v in saved["variants"]}
    assert by_name["Small"]["stock"] == 5
    assert by_name["Small"]["reserved"] == 2
    assert by_name["Large"]["stock"] == 12
    assert by_name["Large"]["reserved"] == 1
    assert by_name["Large"]["price"] == 300
    assert by_name["Large"]["buying_price"] == 166.67


def test_unit_based_restock_adds_base_stock_and_preserves_selling_units(client, owner_token, shop_id):
    units = [
        {"label": "250g", "quantity": 250, "price": 45},
        {"label": "1kg", "quantity": 1000, "price": 180},
    ]
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Sugar Restock",
        product_type="unit_based", base_unit="kg", base_stock_quantity=10,
        buying_price=120, selling_units=json.dumps(units),
    ).json()["_id"]
    db = get_db()
    db.products.update_one({"_id": pid}, {"$set": {"reserved_base": 500}})
    res = client.post(
        "/api/inventory/restock", headers=_auth(owner_token),
        json={"product_id": pid, "base_quantity": 5000,
              "buying_price": 150, "total_cost": 750},
    )
    assert res.status_code == 200, res.text
    saved = db.products.find_one({"_id": pid})
    assert saved["base_stock_quantity"] == 15000
    assert saved["reserved_base"] == 500
    assert saved["buying_price"] == 130
    assert saved["selling_units"] == units


def test_restock_rejects_invalid_quantity_and_unknown_variant(client, owner_token, shop_id):
    standard_id = _create(
        client, owner_token, shop_id=shop_id, name="Invalid Restock",
        price=10, stock=3,
    ).json()["_id"]
    bad_qty = client.post(
        "/api/inventory/restock", headers=_auth(owner_token),
        json={"product_id": standard_id, "qty": 0, "buying_price": 5, "total_cost": 5},
    )
    assert bad_qty.status_code == 400

    variant_id = _create(
        client, owner_token, shop_id=shop_id, name="Unknown Variant Restock",
        product_type="variant",
        variants=json.dumps([{"name": "Small", "stock": 2, "price": 10}]),
    ).json()["_id"]
    missing_variant = client.post(
        "/api/inventory/restock", headers=_auth(owner_token),
        json={"product_id": variant_id, "variant_name": "XL", "qty": 1,
              "buying_price": 5, "total_cost": 5},
    )
    assert missing_variant.status_code == 404

def test_standard_restock_retries_when_checkout_changes_stock_concurrently(
    client, owner_token, shop_id, monkeypatch,
):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Concurrent Restock",
        price=60, buying_price=20, stock=10,
    ).json()["_id"]
    db = get_db()
    original_update_one = db.products.update_one
    simulated_checkout = {"done": False}

    def update_with_interleaved_sale(query, update, *args, **kwargs):
        if not simulated_checkout["done"] and "$inc" in update and "stock" in update["$inc"]:
            simulated_checkout["done"] = True
            # Simulate checkout completing after restock read its snapshot but
            # before its compare-and-set update reaches MongoDB.
            original_update_one(
                {"_id": pid, "shop_id": shop_id},
                {"$inc": {"stock": -2, "reserved": 2}},
            )
        return original_update_one(query, update, *args, **kwargs)

    monkeypatch.setattr(db.products, "update_one", update_with_interleaved_sale)
    res = client.post(
        "/api/inventory/restock",
        headers=_auth(owner_token),
        json={"product_id": pid, "qty": 5, "buying_price": 30, "total_cost": 150},
    )
    assert res.status_code == 200, res.text
    saved = db.products.find_one({"_id": pid})
    assert simulated_checkout["done"] is True
    assert saved["stock"] == 13  # 10 - 2 sold + 5 restocked
    assert saved["reserved"] == 2
    assert saved["buying_price"] == 23.85
    assert db.inventory_movements.count_documents({
        "product_id": pid, "type": "RESTOCK",
    }) == 1

@pytest.mark.parametrize("bad_value", [float("nan"), float("inf"), float("-inf")])
def test_restock_rejects_non_finite_total_cost(client, owner_token, shop_id, bad_value):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Non-finite Cost",
        price=10, stock=2, buying_price=4,
    ).json()["_id"]
    res = client.post(
        "/api/inventory/restock", headers=_auth(owner_token),
        json={"product_id": pid, "qty": 1, "buying_price": 5, "total_cost": bad_value},
    )
    assert res.status_code == 400
    assert get_db().products.find_one({"_id": pid})["stock"] == 2


@pytest.mark.parametrize("field", ["qty", "buying_price"])
@pytest.mark.parametrize("bad_value", [float("nan"), float("inf"), float("-inf")])
def test_restock_rejects_non_finite_quantity_and_buying_price(
    client, owner_token, shop_id, field, bad_value,
):
    pid = _create(
        client, owner_token, shop_id=shop_id, name="Non-finite Input",
        price=10, stock=2, buying_price=4,
    ).json()["_id"]
    payload = {
        "product_id": pid, "qty": 1, "buying_price": 5, "total_cost": 5,
    }
    payload[field] = bad_value
    res = client.post("/api/inventory/restock", headers=_auth(owner_token), json=payload)
    assert res.status_code == 400
    assert get_db().products.find_one({"_id": pid})["stock"] == 2

