from celery.schedules import crontab
from backend.core.celery_app import celery
from backend.tasks.reports import send_daily_reports_task


@celery.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):

    # 🕒 Run every day at 8 AM
    sender.add_periodic_task(
        crontab(hour=8, minute=0),
        send_daily_reports_task.s(),
        name="daily_owner_reports"
    )
