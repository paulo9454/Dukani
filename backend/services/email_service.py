"""Pluggable email service.

Currently uses SMTP via stdlib smtplib. Falls back to a no-op log if SMTP env
vars are not configured, so registration/verification flows still work in dev.

Swap providers (SendGrid, Resend, etc.) by reimplementing `_send_raw` only.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST")) and bool(os.getenv("SMTP_FROM"))


def _send_raw(to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> dict:
    """Send an email via SMTP. Returns {"sent": bool, "reason": str}."""
    if not _smtp_configured():
        # Dev fallback — log instead of sending.
        print(f"[email_service] SMTP not configured; would send to={to_email} subject={subject!r}")
        return {"sent": False, "reason": "smtp_not_configured"}

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or user
    use_tls = os.getenv("SMTP_TLS", "true").lower() != "false"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    if text_body:
        msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        if use_tls:
            ctx = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=15) as srv:
                srv.starttls(context=ctx)
                if user and password:
                    srv.login(user, password)
                srv.send_message(msg)
        else:
            with smtplib.SMTP_SSL(host, port, timeout=15) as srv:
                if user and password:
                    srv.login(user, password)
                srv.send_message(msg)
        return {"sent": True, "reason": "ok"}
    except Exception as exc:
        print(f"[email_service] SMTP send failed: {exc}")
        return {"sent": False, "reason": f"smtp_error:{exc}"}


def send_verification_email(email: str, code: str) -> dict:
    subject = "Verify your Dukayko account"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#16a34a;">Welcome to Dukayko 🛍️</h2>
      <p>Use the verification code below to complete your sign-up:</p>
      <div style="font-size:28px;font-weight:bold;letter-spacing:6px;padding:14px 20px;
                  background:#f1f5f9;border-radius:8px;text-align:center;">
        {code}
      </div>
      <p style="color:#555;font-size:13px;">If you didn't create an account, ignore this email.</p>
      <p style="color:#999;font-size:12px;">Dukayko · Sell. Track. Grow.</p>
    </div>
    """
    text = f"Your Dukayko verification code is: {code}"
    return _send_raw(email, subject, html, text)


def send_order_confirmation(email: str, order: dict) -> dict:
    subject = f"Dukayko order #{order.get('_id', '')[:8]} received"
    items_html = "".join(
        f"<tr><td>{i.get('quantity') or i.get('qty')}× {i.get('name')}</td>"
        f"<td style='text-align:right'>KES {i.get('subtotal')}</td></tr>"
        for i in (order.get("items") or [])
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#16a34a;">🧾 Order received</h2>
      <p>Order ID: <code>{order.get('_id')}</code></p>
      <p>Status: <b>{order.get('status', 'pending')}</b></p>
      <table width="100%" style="border-collapse:collapse;font-size:14px;">
        {items_html}
        <tr><td><b>Total</b></td><td style="text-align:right"><b>KES {order.get('total')}</b></td></tr>
      </table>
      <p style="color:#555;font-size:13px;">You can track your order with this ID.</p>
      <p style="color:#999;font-size:12px;">Dukayko · Sell. Track. Grow.</p>
    </div>
    """
    return _send_raw(email, subject, html)


def is_email_enabled() -> bool:
    return _smtp_configured()
