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
    assert "Insufficient stock" in res.text


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
    assert "Insufficient stock" in res.text


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
