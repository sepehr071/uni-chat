import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

_logger = logging.getLogger(__name__)


def send_invite_email(
    to: str,
    workspace_name: str,
    accept_url: str,
    inviter_name: str,
    role: str,
) -> bool:
    """Send a workspace invite email. Returns True on success, False otherwise.

    If SMTP_HOST is not configured, logs an info message and returns False so
    the caller can render a "copy link" fallback without raising.
    """
    smtp_host = os.environ.get('SMTP_HOST', '').strip()
    if not smtp_host:
        _logger.info("SMTP not configured; skipping invite email to %s", to)
        return False

    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    smtp_from = os.environ.get('SMTP_FROM', smtp_user)

    subject = f"You're invited to {workspace_name}"

    plain = (
        f"Hi,\n\n"
        f"{inviter_name} has invited you to join {workspace_name} as {role}.\n\n"
        f"Accept your invitation:\n{accept_url}\n\n"
        f"This link expires in 7 days."
    )
    html = (
        f"<p>Hi,</p>"
        f"<p><strong>{inviter_name}</strong> has invited you to join "
        f"<strong>{workspace_name}</strong> as <em>{role}</em>.</p>"
        f"<p><a href=\"{accept_url}\">Accept invitation</a></p>"
        f"<p>This link expires in 7 days.</p>"
    )

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = smtp_from
    msg['To'] = to
    msg.attach(MIMEText(plain, 'plain'))
    msg.attach(MIMEText(html, 'html'))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [to], msg.as_string())
        return True
    except Exception:
        _logger.warning("Failed to send invite email to %s", to, exc_info=True)
        return False
