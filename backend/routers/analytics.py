"""Public + owner analytics router.

Frontend calls POST /api/analytics/track with {event_type, shop_id, ...}.
Owners can read aggregated metrics from GET /api/analytics/shop/{shop_id}.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException

from backend.core.deps import require_roles, get_current_user_optional
from backend.db.mongo import get_db
from backend.services.analytics import EVENT_TYPES, track_event


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.post("/track")
def track(payload: dict = Body(...), user=Depends(get_current_user_optional)):
    event_type = payload.get("event_type")
    if event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="invalid event_type")
    track_event(
        event_type,
        shop_id=payload.get("shop_id"),
        user_id=(user or {}).get("_id"),
        order_id=payload.get("order_id"),
        metadata=payload.get("metadata") or {},
    )
    return {"ok": True}


@router.get("/shop/{shop_id}")
def shop_analytics(
    shop_id: str,
    user=Depends(require_roles("owner", "admin", "partner")),
):
    db = get_db()
    if user["role"] != "admin":
        shop = db.shops.find_one({"_id": shop_id})
        if not shop or shop.get("owner_id") != user["_id"]:
            raise HTTPException(status_code=403, detail="Not allowed")

    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    base = {"shop_id": shop_id, "created_at": {"$gte": cutoff}}

    counts = {}
    for ev in EVENT_TYPES:
        counts[ev] = db.analytics.count_documents({**base, "event_type": ev})

    return {
        "window_days": 30,
        "events": counts,
    }
