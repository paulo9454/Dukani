from fastapi import APIRouter, Depends
from backend.core.deps import require_roles
from backend.services.stock_analyzer import analyze_stock_alerts

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/stock")
def stock_notifications(user=Depends(require_roles("owner", "admin", "partner", "shopkeeper"))):
    if user["role"] == "shopkeeper":
        return analyze_stock_alerts(user.get("assigned_shop_ids", []))
    return analyze_stock_alerts()
