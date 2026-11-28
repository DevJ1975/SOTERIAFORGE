"""Open Badges 3.0 credentials: a badge award as a signed, verifiable credential.

Each award can be exported as an `OpenBadgeCredential` in the JWT proof format of
Open Badges 3.0 (a compact JWS, EdDSA/Ed25519). Anyone can check it with the public
key at `/api/credentials/jwks`; nothing here needs the learner to be signed in.

The credential is built from the award row every time and Ed25519 signatures are
deterministic, so nothing extra is stored: the same award always yields the same
document. The learner is identified only by a salted hash of their email (FERPA):
a verifier who already knows the email can confirm it, nobody else can read it.

The private key is the `BADGE_SIGNING_KEY` service variable (PEM). Without it awards
are still recorded and the credential endpoints answer 503. See docs/open-badges.md.
"""

import base64
import hashlib
from functools import lru_cache

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.conf import settings
from rest_framework.exceptions import APIException

from .models import Badge, BadgeAward

CONTEXT = [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
]
ALGORITHM = "EdDSA"


class SigningUnavailable(APIException):
    status_code = 503
    default_detail = "Signed credentials aren't set up yet. Your badge is still recorded."


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@lru_cache(maxsize=2)
def _load(pem: str) -> tuple[Ed25519PrivateKey, dict]:
    try:
        key = serialization.load_pem_private_key(pem.encode(), password=None)
    except (ValueError, TypeError) as exc:
        raise SigningUnavailable("BADGE_SIGNING_KEY isn't a valid PEM private key.") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise SigningUnavailable("BADGE_SIGNING_KEY must be an Ed25519 key.")
    x = _b64(
        key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    )
    # RFC 7638 thumbprint: the key id changes if and only if the key does.
    thumbprint = _b64(
        hashlib.sha256(f'{{"crv":"Ed25519","kty":"OKP","x":"{x}"}}'.encode()).digest()
    )
    jwk = {"kty": "OKP", "crv": "Ed25519", "x": x, "kid": thumbprint, "use": "sig", "alg": "EdDSA"}
    return key, jwk


def signing_key() -> tuple[Ed25519PrivateKey, dict]:
    """(private key, public JWK). Raises SigningUnavailable when no key is configured."""
    if not settings.BADGE_SIGNING_KEY:
        raise SigningUnavailable()
    return _load(settings.BADGE_SIGNING_KEY)


def jwks() -> dict:
    return {"keys": [signing_key()[1]]}


def _url(path: str) -> str:
    return f"{settings.PUBLIC_URL}/api/credentials/{path}"


def page_url(award: BadgeAward) -> str:
    """The human-readable verification page (verify_page.py)."""
    return f"{settings.PUBLIC_URL}/credentials/{award.pk}"


def issuer_url(tenant_id: str) -> str:
    return _url(f"issuers/{tenant_id}")


def issuer_profile(tenant) -> dict:
    return {
        "@context": CONTEXT,
        "id": issuer_url(tenant.pk),
        "type": ["Profile"],
        "name": tenant.name,
        "url": f"https://{tenant.pk}.{settings.ROOT_DOMAIN}",
    }


def achievement(badge: Badge) -> dict:
    how = (
        "Verified and signed off by an instructor."
        if badge.rule == "manual"
        else f"Earned automatically: {badge.get_rule_display().lower()} reached {badge.target}."
    )
    return {
        "id": _url(f"achievements/{badge.pk}"),
        "type": ["Achievement"],
        "name": badge.name,
        "description": badge.description or badge.name,
        "achievementType": "Certificate" if badge.kind == Badge.Kind.CREDENTIAL else "Badge",
        "criteria": {"narrative": how},
    }


def credential(award: BadgeAward) -> dict:
    """The unsigned OpenBadgeCredential for an award (select_related badge, tenant, member)."""
    salt = award.pk.hex
    email = award.member.email.strip().lower()
    return {
        "@context": CONTEXT,
        "id": _url(str(award.pk)),
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "name": award.badge.name,
        "issuer": {
            "id": issuer_url(award.tenant_id),
            "type": ["Profile"],
            "name": award.tenant.name,
        },
        "validFrom": award.awarded_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "credentialSubject": {
            "type": ["AchievementSubject"],
            "identifier": [
                {
                    "type": "IdentityObject",
                    "identityType": "emailAddress",
                    "hashed": True,
                    "salt": salt,
                    "identityHash": "sha256$"
                    + hashlib.sha256(f"{email}{salt}".encode()).hexdigest(),
                }
            ],
            "achievement": achievement(award.badge),
        },
    }


def sign(award: BadgeAward) -> str:
    """The award as a compact JWS (Open Badges 3.0 JWT proof format)."""
    key, jwk = signing_key()
    document = credential(award)
    claims = {
        **document,
        "iss": document["issuer"]["id"],
        "jti": document["id"],
        "sub": document["id"],
        "nbf": int(award.awarded_at.timestamp()),
    }
    return jwt.encode(
        claims,
        key,
        algorithm=ALGORITHM,
        headers={"kid": f"{_url('jwks')}#{jwk['kid']}", "typ": "JWT"},
    )


def read(token: str) -> dict | None:
    """The claims of a credential this server signed, or None."""
    key, _jwk = signing_key()
    try:
        return jwt.decode(
            token,
            key.public_key(),
            algorithms=[ALGORITHM],
            options={"verify_aud": False, "require": ["jti", "iss"]},
        )
    except jwt.PyJWTError:
        return None
