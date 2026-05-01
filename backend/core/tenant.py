from typing import Dict, Any


# =========================
# 🔐 OWNER SCOPE HELPER
# =========================
def owner_scope(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensures every query is automatically scoped to the logged-in owner.
    Prevents cross-tenant data access.
    """
    return {"owner_id": user["_id"]}
