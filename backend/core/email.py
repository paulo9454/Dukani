import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# =========================
# CONFIG (USE GMAIL EXAMPLE)
# =========================
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USER = "paulmose77@gmail.com"
EMAIL_PASS = "zrxx ctml zxzu bkfq"  # NOT your normal password


def send_email(to_email: str, subject: str, html_content: str):
    msg = MIMEMultipart()
    msg["From"] = EMAIL_USER
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(html_content, "html"))

    server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
    server.starttls()
    server.login(EMAIL_USER, EMAIL_PASS)

    server.sendmail(EMAIL_USER, to_email, msg.as_string())
    server.quit()
