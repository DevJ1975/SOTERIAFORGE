"""Sign-in tokens issued by Django.

- Access token: short-lived, signed (HMAC with SECRET_KEY), carries only the member id
  and a fingerprint of the password hash, so changing the password ends old sessions.
  Role and tenant are always read from Postgres, never trusted from the token.
- Refresh token: random secret, stored only as a SHA-256 hash. Each use rotates it; a
  spent token shown again means it leaked, so its whole family is revoked.
- One-time tokens: emailed links for password reset and invites.
"""

import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone

from .models import Member, OneTimeToken, RefreshToken

ACCESS_SALT = "forge.access.v1"


class InvalidToken(Exception):
    """The presented token is unknown, expired, spent or revoked."""


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _password_fingerprint(member: Member) -> str:
    return _hash(member.password)[:16]


# --- access ------------------------------------------------------------------
def issue_access(member: Member) -> str:
    return signing.dumps(
        {"m": str(member.id), "pw": _password_fingerprint(member)},
        salt=ACCESS_SALT,
        compress=False,
    )


def read_access(token: str) -> dict | None:
    """The token's payload, or None if it is not one of ours, tampered with, or expired."""
    try:
        data = signing.loads(token, salt=ACCESS_SALT, max_age=settings.AUTH_ACCESS_TTL)
    except signing.BadSignature:  # includes SignatureExpired
        return None
    return data if isinstance(data, dict) and "m" in data else None


def access_matches(member: Member, payload: dict) -> bool:
    return secrets.compare_digest(payload.get("pw", ""), _password_fingerprint(member))


# --- refresh -----------------------------------------------------------------
def issue_refresh(member: Member, family: uuid.UUID | None = None) -> str:
    raw = secrets.token_urlsafe(48)
    RefreshToken.objects.create(
        member=member,
        family=family or uuid.uuid4(),
        token_hash=_hash(raw),
        expires_at=timezone.now() + timedelta(seconds=settings.AUTH_REFRESH_TTL),
    )
    return raw


def rotate_refresh(raw: str) -> tuple[Member, str] | None:
    """Spend a refresh token and return its member and the replacement token.

    Returns None (rather than raising) when the token is no good, so a caller's
    transaction still commits the revocation that a replayed token triggers.
    """
    token = (
        RefreshToken.objects.select_for_update()
        .select_related("member")
        .filter(token_hash=_hash(raw))
        .first()
    )
    now = timezone.now()
    if token is None or token.revoked_at or token.expires_at <= now:
        return None
    if token.used_at:
        revoke_family(token.family)
        return None
    token.used_at = now
    token.save(update_fields=["used_at"])
    return token.member, issue_refresh(token.member, token.family)


def revoke_family(family: uuid.UUID) -> None:
    RefreshToken.objects.filter(family=family, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def revoke_by_raw(raw: str) -> None:
    token = RefreshToken.objects.filter(token_hash=_hash(raw)).first()
    if token:
        revoke_family(token.family)


def revoke_all(member: Member) -> None:
    RefreshToken.objects.filter(member=member, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


# --- one-time (reset / invite) -----------------------------------------------
def issue_one_time(member: Member, purpose: str) -> str:
    """Create a link token, voiding any earlier unused one for the same purpose."""
    ttl = (
        settings.AUTH_INVITE_TTL
        if purpose == OneTimeToken.Purpose.INVITE
        else settings.AUTH_RESET_TTL
    )
    now = timezone.now()
    OneTimeToken.objects.filter(member=member, purpose=purpose, used_at__isnull=True).update(
        used_at=now
    )
    raw = secrets.token_urlsafe(32)
    OneTimeToken.objects.create(
        member=member,
        purpose=purpose,
        token_hash=_hash(raw),
        expires_at=now + timedelta(seconds=ttl),
    )
    return raw


def consume_one_time(raw: str) -> OneTimeToken:
    """Mark a link token used and return it, or raise InvalidToken."""
    token = (
        OneTimeToken.objects.select_for_update()
        .select_related("member")
        .filter(token_hash=_hash(raw))
        .first()
    )
    now = timezone.now()
    if token is None or token.used_at or token.expires_at <= now:
        raise InvalidToken
    token.used_at = now
    token.save(update_fields=["used_at"])
    return token
