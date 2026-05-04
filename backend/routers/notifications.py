from fastapi import APIRouter, Depends
from backend.core.deps import require_roles, get_assigned_shop_ids
from backend.services.stock_analyzer import analyze_stock_alerts

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/stock")
def stock_notifications(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    if user["role"] == "shopkeeper":
        return analyze_stock_alerts(get_assigned_shop_ids(user["_id"]))
    return analyze_stock_alerts()
