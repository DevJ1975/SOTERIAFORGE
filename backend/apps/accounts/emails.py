"""Emails for password reset and invites."""

from django.conf import settings
from django.core.mail import send_mail

from .models import Member, OneTimeToken


def _base_url(member: Member) -> str:
    if settings.AUTH_LINK_BASE_URL:
        return settings.AUTH_LINK_BASE_URL.rstrip("/")
    tenant = member.tenant
    if tenant is None:
        return f"https://app.{settings.ROOT_DOMAIN}"
    return f"https://{tenant.custom_domain or f'{tenant.id}.{settings.ROOT_DOMAIN}'}"


def send_link_email(member: Member, purpose: str, raw_token: str) -> None:
    invite = purpose == OneTimeToken.Purpose.INVITE
    path = "accept-invite" if invite else "reset-password"
    link = f"{_base_url(member)}/{path}?token={raw_token}"
    name = member.display_name or member.email
    if invite:
        subject = "You're invited to Soteria Forge"
        lead = "You've been invited to Soteria Forge. Set your password to get started."
    else:
        subject = "Reset your Soteria Forge password"
        lead = "Someone asked to reset the password for your Soteria Forge account."
    body = (
        f"Hi {name},\n\n{lead}\n\n{link}\n\n"
        "This link works once and expires soon. If you didn't expect this email, "
        "you can ignore it and your password will stay the same.\n"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [member.email], fail_silently=False)
