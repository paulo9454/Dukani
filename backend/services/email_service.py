""""Pluggable email service using Resend's HTTPS API."""
from __future__ import annotations

import json
import os
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_RESEND_FROM = "Dukayko <no-reply@mail.dukayko.com>"


def _resend_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY") and (os.getenv("RESEND_FROM") or DEFAULT_RESEND_FROM))


def _send_raw(to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> dict:
    """Send an email through Resend. Returns {"sent": bool, "reason": str}."""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        print("[email_service] RESEND_API_KEY is not configured; email not sent")
        return {"sent": False, "reason": "resend_not_configured"}

    payload = {
        "from": os.getenv("RESEND_FROM", DEFAULT_RESEND_FROM),
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    request = Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Dukayko/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            response.read()
            if 200 <= response.status < 300:
                return {"sent": True, "reason": "ok"}
            print(f"[email_service] Resend returned HTTP {response.status}")
            return {"sent": False, "reason": f"resend_http_{response.status}"}
    except HTTPError as exc:
        # Do not log the request payload, recipient, or API key.
        print(f"[email_service] Resend rejected email with HTTP {exc.code}")
        return {"sent": False, "reason": f"resend_http_{exc.code}"}
    except (URLError, TimeoutError, OSError) as exc:
        print(f"[email_service] Resend connection failed: {type(exc).__name__}")
        return {"sent": False, "reason": "resend_connection_error"}
    except Exception as exc:
        print(f"[email_service] Resend send failed: {type(exc).__name__}")
        return {"sent": False, "reason": "resend_error"}


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
    subject = f"Dukayko order #{str(order.get('_id', ''))[:8]} received"
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
    return _resend_configured()


def send_password_reset_email(email: str, reset_url: str) -> dict:
    subject = "Reset your Dukayko password"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a;">
      <h2 style="color:#16a34a;">Reset your Dukayko password</h2>
      <p>We received a request to reset the password for your Dukayko account.</p>
      <p><a href="{reset_url}" style="display:inline-block;padding:12px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a></p>
      <p>This link expires in 30 minutes and can only be used once.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p style="color:#64748b;font-size:12px;">Dukayko · Sell. Track. Grow.</p>
    </div>
    """
    text = (
        "We received a request to reset your Dukayko password. "
        f"Open this link within 30 minutes: {reset_url} "
        "If you did not request this, ignore this email."
    )
    return _send_raw(email, subject, html, text)
