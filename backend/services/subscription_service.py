from datetime import datetime, timezone
from fastapi import HTTPException

TRIAL_PLAN = "trial"
POS_PLAN = "pos"
POS_ONLINE_PLAN = "pos_online"
VALID_PLANS = {TRIAL_PLAN, POS_PLAN, POS_ONLINE_PLAN}

PLAN_LABELS = {
    TRIAL_PLAN: "Free Trial",
    POS_PLAN: "POS",
    POS_ONLINE_PLAN: "POS + Online",
}

def now_utc():
    return datetime.now(timezone.utc)

def parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None

def normalize_plan(plan):
    return plan or TRIAL_PLAN

def get_subscription(db, shop_id: str):
    shop = db.shops.find_one({"_id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    sub = db.subscriptions.find_one({"shop_id": shop_id}) or {}

    raw_plan = sub.get("plan") or shop.get("subscription_plan")
    plan = normalize_plan(raw_plan)
    status = sub.get("status") or shop.get("subscription_status") or "trial"

    trial_end = parse_dt(sub.get("trial_end") or shop.get("trial_end_at"))
    subscription_end = parse_dt(
        sub.get("subscription_end")
        or sub.get("paid_until")
        or shop.get("subscription_end")
    )

    now = now_utc()
    is_paid = bool(sub.get("is_paid")) or status == "active"

    is_trial = plan == TRIAL_PLAN or status == "trial"
    trial_active = is_trial and trial_end and trial_end > now

    paid_active = (
        plan in {POS_PLAN, POS_ONLINE_PLAN}
        and status == "active"
        and (is_paid or subscription_end is None or subscription_end > now)
    )

    active = bool(trial_active or paid_active)

    if is_trial:
        effective_status = "trial" if trial_active else "expired"
    else:
        effective_status = "active" if paid_active else "expired"

    days_left = None
    expiry = trial_end if is_trial else subscription_end
    if expiry:
        days_left = max((expiry.date() - now.date()).days, 0)

    can_use_pos = active and plan in {TRIAL_PLAN, POS_PLAN, POS_ONLINE_PLAN}
    can_use_online = active and plan in {TRIAL_PLAN, POS_ONLINE_PLAN}

    return {
        "shop_id": shop_id,
        "plan": plan,
        "plan_label": PLAN_LABELS.get(plan, plan),
        "status": effective_status,
        "active": active,
        "is_trial": is_trial,
        "trial_active": bool(trial_active),
        "days_left": days_left,
        "trial_end": trial_end.isoformat() if trial_end else None,
        "subscription_end": subscription_end.isoformat() if subscription_end else None,
        "features": {
            "pos": can_use_pos,
            "online": can_use_online,
            "inventory": can_use_pos,
            "reports": can_use_pos,
        },
    }

def require_pos(db, shop_id: str):
    sub = get_subscription(db, shop_id)
    if not sub["features"]["pos"]:
        raise HTTPException(status_code=403, detail="POS access inactive. Please subscribe to continue.")
    return sub

def require_online(db, shop_id: str):
    sub = get_subscription(db, shop_id)
    if not sub["features"]["online"]:
        raise HTTPException(status_code=403, detail="Online shop access inactive. Please subscribe to continue.")
    return sub
