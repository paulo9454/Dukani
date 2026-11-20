"""Legacy SMTP helper.

Credentials must be supplied through environment variables; never commit secrets.
The main application email flow uses backend.services.email_service.
"""
import os
import smtplib
import ssl
from email.message import EmailMessage


def send_email(to_email: str, subject: str, html_content: str):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", user)

    if not sender or not user or not password:
        raise RuntimeError("SMTP is not configured; set SMTP_USER, SMTP_PASSWORD and SMTP_FROM")

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.add_alternative(html_content, subtype="html")

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls(context=context)
        server.login(user, password)
        server.send_message(msg)
