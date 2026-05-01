from celery import Celery
from celery.schedules import crontab

celery = Celery(
    "dukani",
    broker="redis://127.0.0.1:6379/0",
    backend="redis://127.0.0.1:6379/0",
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Nairobi",
    enable_utc=False,
)

# 🔥 IMPORT TASKS
import backend.tasks.reports

# =========================
# ⏰ DAILY REPORT (7AM)
# =========================
celery.conf.beat_schedule = {
    "daily-report": {
        "task": "backend.tasks.reports.send_daily_reports_task",
        "schedule": crontab(hour=7, minute=0),
    }
}
