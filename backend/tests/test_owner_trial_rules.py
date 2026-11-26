import importlib
from datetime import datetime

import mongomock
import pytest
from fastapi import HTTPException

from backend.core.settings import settings
from backend.services.trial_device import hash_trial_device_id

owner_router = importlib.import_module("backend.routers.owner")


@pytest.fixture
def trial_db(monkeypatch):
    client = mongomock.MongoClient()
    db = client["dukani_trial_test"]

    monkeypatch.setattr(owner_router, "get_db", lambda: db)
    monkeypatch.setattr(settings, "trial_device_secret", "test-only-secret")

    yield db

    client.close()


def add_owner(db, owner_id, device_id=None):
    user = {
        "_id": owner_id,
        "email": f"{owner_id}@example.test",
        "role": "owner",
        "trial_used": False,
    }

    if device_id:
        user["trial_device_hash"] = hash_trial_device_id(device_id)

    db.users.insert_one(user)
    return user


def create_shop(owner, name, device_id=None):
    payload = {"name": name}

    if device_id:
        payload["device_id"] = device_id

    return owner_router.create_owner_shop(payload, owner)


def test_first_shop_receives_30_day_pos_online_trial(trial_db):
    device_id = "device-first-owner-001"
    owner = add_owner(trial_db, "owner1", device_id)

    result = create_shop(owner, "First Shop", device_id)
    shop = result["shop"]

    assert shop["subscription_plan"] == "trial"
    assert shop["subscription_status"] == "trial"
    assert shop["pos_enabled"] is True
    assert shop["online_enabled"] is True
    assert shop["is_online_enabled"] is True

    start = datetime.fromisoformat(shop["trial_start_at"])
    end = datetime.fromisoformat(shop["trial_end_at"])
    assert end - start == pytest.approx(
        __import__("datetime").timedelta(days=30)
    )

    subscription = trial_db.subscriptions.find_one(
        {"shop_id": shop["_id"]}
    )
    assert subscription["plan"] == "trial"
    assert subscription["status"] == "trial"
    assert subscription["is_paid"] is False

    updated_owner = trial_db.users.find_one({"_id": "owner1"})
    assert updated_owner["trial_used"] is True


def test_second_shop_does_not_receive_another_trial(trial_db):
    device_id = "device-second-shop-002"
    owner = add_owner(trial_db, "owner2", device_id)

    first = create_shop(owner, "First Shop", device_id)
    second = create_shop(owner, "Second Shop")

    assert first["shop"]["subscription_status"] == "trial"
    assert second["shop"]["subscription_status"] == "inactive"
    assert second["shop"]["subscription_plan"] == "pos"
    assert second["shop"]["trial_start_at"] is None

    assert trial_db.trial_device_claims.count_documents({}) == 1


def test_same_device_cannot_claim_trial_for_another_owner(trial_db):
    device_id = "shared-device-003"

    owner1 = add_owner(trial_db, "owner3", device_id)
    owner2 = add_owner(trial_db, "owner4", device_id)

    create_shop(owner1, "Owner Three Shop", device_id)

    with pytest.raises(HTTPException) as exc:
        create_shop(owner2, "Owner Four Shop", device_id)

    assert exc.value.status_code == 409
    assert trial_db.shops.count_documents(
        {"owner_id": "owner4"}
    ) == 0


def test_legacy_owner_without_device_hash_can_claim_first_trial(trial_db):
    owner = add_owner(trial_db, "legacy-owner")

    device_id = "legacy-device-004"
    result = create_shop(owner, "Legacy First Shop", device_id)

    assert result["shop"]["subscription_status"] == "trial"

    updated_owner = trial_db.users.find_one(
        {"_id": "legacy-owner"}
    )
    assert updated_owner["trial_device_hash"] == hash_trial_device_id(
        device_id
    )
    assert updated_owner["trial_used"] is True


def test_existing_shop_owner_does_not_receive_trial(trial_db):
    owner = add_owner(trial_db, "paid-owner", "paid-device-identifier-005")

    trial_db.shops.insert_one({
        "_id": "existing-paid-shop",
        "name": "Existing Paid Shop",
        "owner_id": owner["_id"],
        "subscription_plan": "pos_online",
        "subscription_status": "active",
        "online_enabled": True,
        "pos_enabled": True,
    })

    trial_db.subscriptions.insert_one({
        "shop_id": "existing-paid-shop",
        "plan": "pos_online",
        "status": "active",
        "is_paid": True,
    })

    result = create_shop(owner, "Additional Shop")

    assert result["shop"]["subscription_status"] == "inactive"
    assert result["shop"]["trial_start_at"] is None

    original_subscription = trial_db.subscriptions.find_one(
        {"shop_id": "existing-paid-shop"}
    )
    assert original_subscription["plan"] == "pos_online"
    assert original_subscription["status"] == "active"
    assert original_subscription["is_paid"] is True

    updated_owner = trial_db.users.find_one({"_id": "paid-owner"})
    assert updated_owner["trial_used"] is True
    assert updated_owner["trial_legacy_blocked"] is True


def test_trial_activation_failure_rolls_back_claim_and_shop(trial_db, monkeypatch):
    device_id = "rollback-device-identifier-006"
    owner = add_owner(trial_db, "rollback-owner", device_id)

    original_update_one = trial_db.subscriptions.update_one
    call_count = 0

    def fail_trial_activation(query, update, *args, **kwargs):
        nonlocal call_count
        call_count += 1

        # First update creates the inactive subscription.
        # Second update activates the trial; simulate a database failure.
        if call_count == 2:
            raise RuntimeError("Simulated trial activation failure")

        return original_update_one(query, update, *args, **kwargs)

    monkeypatch.setattr(
        trial_db.subscriptions,
        "update_one",
        fail_trial_activation,
    )

    with pytest.raises(RuntimeError, match="Simulated trial activation failure"):
        create_shop(owner, "Rollback Test Shop", device_id)

    assert trial_db.shops.count_documents({}) == 0
    assert trial_db.subscriptions.count_documents({}) == 0
    assert trial_db.trial_device_claims.count_documents({}) == 0

    updated_owner = trial_db.users.find_one({"_id": "rollback-owner"})

    assert not updated_owner.get("trial_used", False)
    assert "trial_shop_id" not in updated_owner
    assert "trial_started_at" not in updated_owner

    # Device binding remains, but the failed trial claim is released.
    assert updated_owner["trial_device_hash"] == hash_trial_device_id(device_id)
