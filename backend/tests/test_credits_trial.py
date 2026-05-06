"""
End-to-end tests for:
- Credits ledger (manual create, repay cash/manual/mpesa, overpay, race safety, transactions, tenant isolation)
- 30-day trial: trial creation, public storefront gating, POS gating on expiry
- Owner-without-assignment POS access
- Legacy POS-created credit_customers compat

Environment: uses REACT_APP_BACKEND_URL from frontend/.env as the public base URL.
"""
import os
import uuid
import threading
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing in /app/frontend/.env"

_be = dotenv_values("/app/backend/.env")
MONGO_URL = _be.get("MONGO_URL")
DB_NAME = _be.get("DB_NAME")
db = MongoClient(MONGO_URL)[DB_NAME]

OWNER = ("owner.seed@dukani.dev", "Dukani@2026")
KEEPER_A = ("keeper.a@dukani.dev", "Keeper@2026")
KEEPER_B = ("keeper.b@dukani.dev", "Keeper@2026")


# =========================================================
# Fixtures
# =========================================================
@pytest.fixture(scope="session", autouse=True)
def seed():
    r = requests.post(f"{BASE_URL}/api/dev/seed", timeout=30)
    assert r.status_code in (200, 201), r.text


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def tokens():
    return {
        "owner": _login(*OWNER),
        "keeper_a": _login(*KEEPER_A),
        "keeper_b": _login(*KEEPER_B),
    }


@pytest.fixture(scope="session")
def seeded_shops(tokens):
    """Fetch the seeded shops for the owner."""
    r = requests.get(f"{BASE_URL}/api/owner/shops", headers=_auth(tokens["owner"]), timeout=15)
    assert r.status_code == 200, r.text
    shops = r.json()
    assert len(shops) >= 2
    main = next((s for s in shops if "Main" in (s.get("name") or "")), shops[0])
    branch = next((s for s in shops if "Branch" in (s.get("name") or "")), shops[1])
    return {"main": main, "branch": branch}


# =========================================================
# TRIAL CREATION
# =========================================================
class TestTrial:
    def test_create_shop_sets_trial(self, tokens):
        name = f"TEST_trial_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/owner/shops",
            headers=_auth(tokens["owner"]),
            json={"name": name},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        shop = r.json()["shop"]
        assert shop["subscription_plan"] == "trial_pos_online"
        assert shop["subscription_status"] == "trial"
        assert shop["online_enabled"] is True
        assert shop.get("trial_start_at") and shop.get("trial_end_at")

        # Validate trial window ~30 days
        start = datetime.fromisoformat(shop["trial_start_at"])
        end = datetime.fromisoformat(shop["trial_end_at"])
        delta = (end - start).days
        assert 29 <= delta <= 30

        # Verify subscription row created in trial state
        sub = db.subscriptions.find_one({"shop_id": shop["_id"]})
        assert sub and sub["plan"] == "trial_pos_online"
        assert sub["status"] == "trial"
        assert sub["is_paid"] is False

        # Public storefront should return 200 while trial is active
        r2 = requests.get(f"{BASE_URL}/api/public/shop/{shop['slug']}", timeout=15)
        assert r2.status_code == 200, r2.text

        # Cleanup
        db.shops.delete_one({"_id": shop["_id"]})
        db.subscriptions.delete_one({"shop_id": shop["_id"]})

    def test_expired_trial_blocks_storefront_and_pos(self, tokens):
        # Create a shop then expire the trial directly via Mongo
        name = f"TEST_expired_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{BASE_URL}/api/owner/shops",
            headers=_auth(tokens["owner"]),
            json={"name": name},
            timeout=15,
        )
        shop = r.json()["shop"]
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        db.shops.update_one({"_id": shop["_id"]}, {"$set": {"trial_end_at": past}})
        db.subscriptions.update_one({"shop_id": shop["_id"]}, {"$set": {"trial_end": past}})

        # Storefront blocked
        r_store = requests.get(f"{BASE_URL}/api/public/shop/{shop['slug']}", timeout=15)
        assert r_store.status_code == 403
        assert "not currently selling online" in r_store.json()["detail"].lower()

        # POS blocked with expected message
        r_pos = requests.post(
            f"{BASE_URL}/api/orders/checkout",
            headers={**_auth(tokens["owner"]), "Idempotency-Key": str(uuid.uuid4())},
            json={
                "shop_id": shop["_id"],
                "items": [],
                "payment_method": "cash",
                "payment_provider": "cash",
                "idempotency_key": str(uuid.uuid4()),
            },
            timeout=15,
        )
        assert r_pos.status_code == 403, r_pos.text
        assert "free trial has expired" in r_pos.json()["detail"].lower()

        # Cleanup
        db.shops.delete_one({"_id": shop["_id"]})
        db.subscriptions.delete_one({"shop_id": shop["_id"]})


# =========================================================
# CREDITS — manual create
# =========================================================
class TestCreditsManualCreate:
    def test_create_open(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Alice", "shop_id": sid, "total_amount": 1000},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "open"
        assert d["balance"] == 1000
        assert d["amount_paid"] == 0
        assert d["source"] == "manual_import"
        db.credit_customers.delete_one({"_id": d["_id"]})

    def test_create_partial_paid(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Bob", "shop_id": sid, "total_amount": 1000, "amount_paid": 400},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "open"
        assert d["balance"] == 600
        assert d["amount_paid"] == 400
        db.credit_customers.delete_one({"_id": d["_id"]})

    def test_create_fully_paid(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Carol", "shop_id": sid, "total_amount": 500, "amount_paid": 500},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "paid"
        assert d["balance"] == 0
        db.credit_customers.delete_one({"_id": d["_id"]})

    @pytest.mark.parametrize("payload,expected", [
        ({"customer_name": "X", "total_amount": 0}, 400),
        ({"customer_name": "X", "total_amount": -10}, 400),
        ({"customer_name": "X", "total_amount": 100, "amount_paid": -1}, 400),
        ({"customer_name": "X", "total_amount": 100, "amount_paid": 200}, 400),
    ])
    def test_validation(self, tokens, seeded_shops, payload, expected):
        payload = {**payload, "shop_id": seeded_shops["main"]["_id"]}
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json=payload,
            timeout=15,
        )
        assert r.status_code == expected, r.text


# =========================================================
# CREDITS — list, repay, transactions
# =========================================================
class TestCreditsRepayAndList:
    @pytest.fixture
    def open_credit(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Repay", "shop_id": sid, "total_amount": 1000},
            timeout=15,
        )
        d = r.json()
        yield d
        db.credit_customers.delete_one({"_id": d["_id"]})
        db.credit_payments_history.delete_many({"credit_id": d["_id"]})

    def test_list_filter(self, tokens, open_credit):
        r = requests.get(f"{BASE_URL}/api/credits?status=open", headers=_auth(tokens["owner"]), timeout=15)
        assert r.status_code == 200
        ids = [c["_id"] for c in r.json()]
        assert open_credit["_id"] in ids

    def test_repay_cash_partial_then_full(self, tokens, open_credit):
        cid = open_credit["_id"]
        r1 = requests.post(
            f"{BASE_URL}/api/credits/{cid}/repay",
            headers=_auth(tokens["owner"]),
            json={"amount": 400, "method": "cash"},
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["balance"] == 600
        assert r1.json()["status"] == "open"

        r2 = requests.post(
            f"{BASE_URL}/api/credits/{cid}/repay",
            headers=_auth(tokens["owner"]),
            json={"amount": 600, "method": "manual"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["balance"] == 0
        assert r2.json()["status"] == "paid"

        r3 = requests.get(
            f"{BASE_URL}/api/credits/{cid}/transactions",
            headers=_auth(tokens["owner"]),
            timeout=15,
        )
        assert r3.status_code == 200
        rows = r3.json()
        assert len(rows) >= 2
        methods = [row["method"] for row in rows]
        assert "cash" in methods and "manual" in methods

    def test_repay_overpay_rejected(self, tokens, open_credit):
        r = requests.post(
            f"{BASE_URL}/api/credits/{open_credit['_id']}/repay",
            headers=_auth(tokens["owner"]),
            json={"amount": 5000, "method": "cash"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "exceeds" in r.json()["detail"].lower()

    def test_concurrent_repay_cannot_overdraft(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Race", "shop_id": sid, "total_amount": 100},
            timeout=15,
        )
        cid = r.json()["_id"]
        results = []

        def hit():
            try:
                resp = requests.post(
                    f"{BASE_URL}/api/credits/{cid}/repay",
                    headers=_auth(tokens["owner"]),
                    json={"amount": 100, "method": "cash"},
                    timeout=20,
                )
                results.append(resp.status_code)
            except Exception as e:
                results.append(str(e))

        threads = [threading.Thread(target=hit) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Exactly one should succeed, the other should 400
        success = [s for s in results if s == 200]
        failed = [s for s in results if s == 400]
        assert len(success) == 1 and len(failed) == 1, f"Expected 1 success+1 failure; got {results}"

        # Final DB state must not be negative
        doc = db.credit_customers.find_one({"_id": cid})
        assert doc["balance"] == 0
        assert doc["amount_paid"] == 100
        assert doc["status"] == "paid"

        db.credit_customers.delete_one({"_id": cid})
        db.credit_payments_history.delete_many({"credit_id": cid})


# =========================================================
# CREDIT — STK push & MPesa callback
# =========================================================
class TestCreditSTKCallback:
    def test_stk_callback_decrements_atomically(self, tokens, seeded_shops):
        """Skip outbound Daraja call; simulate a pending credit_settlement
        payment row and POST the M-Pesa callback endpoint."""
        sid = seeded_shops["main"]["_id"]
        # Create a credit with balance 500
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_STK", "shop_id": sid, "total_amount": 500},
            timeout=15,
        )
        credit = r.json()
        cid = credit["_id"]

        reference = f"ws_TEST_{uuid.uuid4().hex[:10]}"
        db.payments.insert_one({
            "_id": str(uuid.uuid4()),
            "reference": reference,
            "provider": "mpesa",
            "amount": 200.0,
            "currency": "KES",
            "shop_id": sid,
            "credit_id": cid,
            "credit_ledger_id": cid,
            "payment_type": "credit_settlement",
            "phone": "254700000000",
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
        })

        callback = {
            "Body": {
                "stkCallback": {
                    "CheckoutRequestID": reference,
                    "ResultCode": 0,
                    "ResultDesc": "Success",
                    "CallbackMetadata": {
                        "Item": [
                            {"Name": "Amount", "Value": 200},
                            {"Name": "MpesaReceiptNumber", "Value": "TEST123"},
                            {"Name": "PhoneNumber", "Value": 254700000000},
                        ]
                    },
                }
            }
        }
        r2 = requests.post(f"{BASE_URL}/api/payments/mpesa/callback", json=callback, timeout=15)
        assert r2.status_code in (200, 201), r2.text

        # Verify balance decremented
        updated = db.credit_customers.find_one({"_id": cid})
        assert updated["balance"] == 300
        assert updated["amount_paid"] == 200

        # Verify history row with method=mpesa
        hist = list(db.credit_payments_history.find({"credit_id": cid}))
        assert any(h.get("method") == "mpesa" for h in hist), hist

        db.credit_customers.delete_one({"_id": cid})
        db.credit_payments_history.delete_many({"credit_id": cid})
        db.payments.delete_one({"reference": reference})


# =========================================================
# TENANT ISOLATION
# =========================================================
class TestTenantIsolation:
    def test_keeper_a_cannot_create_credit_in_shop_b(self, tokens, seeded_shops):
        sid_b = seeded_shops["branch"]["_id"]
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["keeper_a"]),
            json={"customer_name": "TEST_Isolation", "shop_id": sid_b, "total_amount": 100},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_keeper_a_cannot_list_shop_b_credits(self, tokens, seeded_shops):
        sid_b = seeded_shops["branch"]["_id"]
        r = requests.get(
            f"{BASE_URL}/api/credits?shop_id={sid_b}",
            headers=_auth(tokens["keeper_a"]),
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_keeper_a_cannot_repay_shop_b_credit(self, tokens, seeded_shops):
        sid_b = seeded_shops["branch"]["_id"]
        # Owner creates a credit in shop B
        r = requests.post(
            f"{BASE_URL}/api/credits/manual-create",
            headers=_auth(tokens["owner"]),
            json={"customer_name": "TEST_Cross", "shop_id": sid_b, "total_amount": 100},
            timeout=15,
        )
        cid = r.json()["_id"]

        r2 = requests.post(
            f"{BASE_URL}/api/credits/{cid}/repay",
            headers=_auth(tokens["keeper_a"]),
            json={"amount": 10, "method": "cash"},
            timeout=15,
        )
        assert r2.status_code == 403, r2.text

        r3 = requests.get(
            f"{BASE_URL}/api/credits/{cid}/transactions",
            headers=_auth(tokens["keeper_a"]),
            timeout=15,
        )
        assert r3.status_code == 403, r3.text

        db.credit_customers.delete_one({"_id": cid})


# =========================================================
# OWNER WITHOUT ASSIGNMENT — POS access on own shop
# =========================================================
class TestOwnerPOSAccess:
    def test_owner_can_pos_on_own_shop_without_assignment(self, tokens, seeded_shops):
        """Owner (no assignment record) should be allowed through resolve_shop
        + check_shop_access. Use an empty items list to isolate access check
        from inventory logic."""
        sid = seeded_shops["main"]["_id"]
        # Confirm no shopkeeper assignment exists for the owner user
        owner_doc = db.users.find_one({"email": OWNER[0]})
        assert owner_doc and owner_doc["role"] == "owner"
        # Run POS checkout — trial is active so POS should be allowed
        resp = requests.post(
            f"{BASE_URL}/api/orders/checkout",
            headers={**_auth(tokens["owner"]), "Idempotency-Key": str(uuid.uuid4())},
            json={
                "shop_id": sid,
                "items": [],
                "payment_method": "cash",
                "payment_provider": "cash",
                "idempotency_key": str(uuid.uuid4()),
            },
            timeout=15,
        )
        # 400/422 (empty cart business rule) is acceptable; 403 is NOT.
        assert resp.status_code != 403, f"Owner blocked from own shop: {resp.text}"


# =========================================================
# LEGACY COMPAT — credit_customers POS rows
# =========================================================
class TestLegacyCompat:
    def test_legacy_credit_customer_row_appears(self, tokens, seeded_shops):
        sid = seeded_shops["main"]["_id"]
        legacy_id = str(uuid.uuid4())
        db.credit_customers.insert_one({
            "_id": legacy_id,
            "shop_id": sid,
            "name": "TEST_Legacy",
            "balance": 250,
            "credit_limit": 500,
            "created_at": datetime.utcnow().isoformat(),
        })
        try:
            r = requests.get(
                f"{BASE_URL}/api/credits?shop_id={sid}",
                headers=_auth(tokens["owner"]),
                timeout=15,
            )
            assert r.status_code == 200
            rows = r.json()
            row = next((c for c in rows if c["_id"] == legacy_id), None)
            assert row is not None
            assert row.get("customer_name") == "TEST_Legacy"
            assert row.get("balance") == 250
        finally:
            db.credit_customers.delete_one({"_id": legacy_id})
