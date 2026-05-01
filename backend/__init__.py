try:
    from backend.core.celery_app import celery
    __all__ = ("celery",)
except Exception:
    # Celery is optional for API-only runtime; do not fail package import.
    celery = None
    __all__ = ()
