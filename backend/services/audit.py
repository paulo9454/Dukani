from backend.db.mongo import get_db
from datetime import datetime, timezone
import uuid


def audit_log(event_type: str, actor_id: str | None = None, status: str = "success", metadata: dict | None = None):
    try:
        db = get_db()
        db.audit_logs.insert_one(
            {
                "_id": str(uuid.uuid4()),
                "event_type": event_type,
                "actor_id": actor_id,
                "status": status,
                "metadata": metadata or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        # non-blocking logging
        pass
