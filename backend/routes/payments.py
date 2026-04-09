from fastapi import APIRouter, Depends, HTTPException
from backend.core.deps import require_roles

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/providers/compare")
def compare_providers():
    return {
        "providers": [
            {"name": "Stripe", "fee_percent": 2.9, "supports_marketplace": True, "methods": ["card"]},
            {"name": "PayPal", "fee_percent": 3.49, "supports_marketplace": True, "methods": ["card"]},
            {"name": "M-Pesa", "fee_percent": 1.7, "supports_marketplace": False, "methods": ["mpesa", "cash"]},
            {"name": "InternalCredit", "fee_percent": 0, "supports_marketplace": False, "methods": ["credit"]},
            {"name": "Paystack", "fee_percent": 1.5, "supports_marketplace": False, "methods": ["paystack", "card"]},
        ]
    }


@router.post("/paystack/verify")
def verify_paystack(payload: dict, user=Depends(require_roles("owner", "admin", "partner", "shopkeeper", "customer"))):
    reference = (payload or {}).get("reference", "")
    if not reference:
        raise HTTPException(status_code=400, detail="reference is required")

    # Sandbox-safe verification stub. Real integration should call Paystack verify API
    # from the backend using secret key and webhook reconciliation.
    if str(reference).lower().startswith("fail"):
        return {
            "status": "failed",
            "verified": False,
            "reference": reference,
            "provider": "Paystack",
        }

    return {
        "status": "success",
        "verified": True,
        "reference": reference,
        "verified_by": user["_id"],
        "provider": "Paystack",
    }
