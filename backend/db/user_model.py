from datetime import datetime, timezone, timedelta


def create_user_document(user_id: str, email: str, full_name: str, role: str, password_hash: str):
    """
    Standard user document builder for MongoDB
    """

    base = {
        "_id": user_id,
        "email": email,
        "full_name": full_name,
        "role": role,
        "password_hash": password_hash,
        "assigned_shop_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # 🧠 OWNER SAAS LOGIC (14 DAY TRIAL)
    if role == "owner":
        trial_start = datetime.now(timezone.utc)
        trial_end = trial_start + timedelta(days=14)

        base.update({
            "plan": "pos",
            "subscription_status": "trial",
            "trial_start": trial_start.isoformat(),
            "trial_end": trial_end.isoformat(),
            "shops_owned": [],   # 🧠 IMPORTANT: owner owns multiple shops
        })

    else:
        base.update({
            "plan": None,
            "subscription_status": "active",
        })

    return base
