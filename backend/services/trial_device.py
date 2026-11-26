import hashlib
import hmac

from fastapi import HTTPException
from backend.core.settings import settings


def hash_trial_device_id(device_id: str) -> str:
    """Return a keyed hash of a browser device identifier."""
    secret = settings.trial_device_secret

    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Device protection is not configured",
        )

    if not isinstance(device_id, str) or not 16 <= len(device_id) <= 128:
        raise HTTPException(
            status_code=400,
            detail="A valid device identification is required",
        )

    return hmac.new(
        secret.encode("utf-8"),
        device_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
