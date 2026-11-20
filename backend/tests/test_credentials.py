"""Signed Open Badges 3.0 credentials: issue, verify publicly, and fail closed."""

import hashlib

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.management import call_command

from apps.accounts.models import Role
from apps.gamification import badges
from apps.gamification.models import Badge, BadgeAward
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


def pem() -> str:
    return (
        Ed25519PrivateKey.generate()
        .private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        .decode()
    )


@pytest.fixture
def key(settings):
    settings.BADGE_SIGNING_KEY = pem()
    settings.PUBLIC_URL = "https://api.soteriaforge.com"


@pytest.fixture
def award(lakewood):
    lee = make_member(lakewood, "lee")
    tutor = make_member(lakewood, "tutor", Role.INSTRUCTOR)
    badge = Badge.objects.create(
        tenant=lakewood, key="ai-ready", name="AI-Ready Professional", kind="credential"
    )
    assert badges.grant(badge=badge, member=lee, by=tutor)
    return BadgeAward.objects.get(member=lee, badge=badge)


def as_(uid):
    return client_for(sign_in(uid), "lakewood")


def test_holder_gets_a_signed_open_badge(key, award):
    body = as_("lee").get(f"/api/me/badges/{award.badge_id}/credential").json()
    doc = body["credential"]
    assert doc["type"] == ["VerifiableCredential", "OpenBadgeCredential"]
    assert doc["issuer"]["name"] == "Lakewood University"
    assert doc["credentialSubject"]["achievement"]["name"] == "AI-Ready Professional"
    assert body["verifyUrl"] == f"https://api.soteriaforge.com/api/credentials/{award.pk}"

    # Anyone can check it with the published key alone.
    jwk = client_for().get("/api/credentials/jwks").json()["keys"][0]
    header = jwt.get_unverified_header(body["jwt"])
    assert header["alg"] == "EdDSA" and header["kid"].endswith(f"#{jwk['kid']}")
    claims = jwt.decode(
        body["jwt"], jwt.PyJWK(jwk).key, algorithms=["EdDSA"], options={"verify_aud": False}
    )
    assert claims["iss"] == doc["issuer"]["id"] and claims["jti"] == doc["id"]


def test_the_learner_is_named_only_by_a_salted_hash(key, award):
    body = as_("lee").get(f"/api/me/badges/{award.badge_id}/credential").json()
    assert "lee@example.com" not in str(body)
    identity = body["credential"]["credentialSubject"]["identifier"][0]
    expected = hashlib.sha256(f"lee@example.com{identity['salt']}".encode()).hexdigest()
    assert identity["identityHash"] == f"sha256${expected}"


def test_public_pages_need_no_sign_in(key, award, lakewood):
    anyone = client_for()
    assert anyone.get(f"/api/credentials/{award.pk}").json()["credential"]["name"] == (
        "AI-Ready Professional"
    )
    assert anyone.get("/api/credentials/issuers/lakewood").json()["name"] == "Lakewood University"
    assert anyone.get(f"/api/credentials/achievements/{award.badge_id}").json()["type"] == [
        "Achievement"
    ]
    assert anyone.get("/api/credentials/issuers/nope").status_code == 404


def test_verify_accepts_ours_and_rejects_tampering(key, award, settings):
    token = client_for().get(f"/api/credentials/{award.pk}").json()["jwt"]
    verify = lambda t: client_for().post("/api/credentials/verify", {"jwt": t}, format="json")  # noqa: E731
    assert verify(token).json()["valid"] is True

    head, payload, signature = token.split(".")
    assert verify(f"{head}.{payload}.{signature[:-4]}AAAA").json()["valid"] is False
    assert verify("not-a-jwt").json()["valid"] is False

    # A credential signed by someone else's key is not ours.
    settings.BADGE_SIGNING_KEY = pem()
    assert verify(token).json()["valid"] is False


def test_a_renamed_badge_no_longer_verifies_the_old_document(key, award):
    token = client_for().get(f"/api/credentials/{award.pk}").json()["jwt"]
    Badge.objects.filter(pk=award.badge_id).update(name="Something else")
    result = client_for().post("/api/credentials/verify", {"jwt": token}, format="json").json()
    assert result["valid"] is False and "current record" in result["reason"]


def test_you_only_export_your_own(key, award, lakewood):
    make_member(lakewood, "mo")
    assert as_("mo").get(f"/api/me/badges/{award.badge_id}/credential").status_code == 404


def test_without_a_key_awards_stand_and_signing_is_503(award, settings):
    settings.BADGE_SIGNING_KEY = ""
    assert as_("lee").get(f"/api/me/badges/{award.badge_id}/credential").status_code == 503
    assert client_for().get("/api/credentials/jwks").status_code == 503
    mine = as_("lee").get("/api/me/badges").json()
    assert [b["awardId"] for b in mine if b["key"] == "ai-ready"] == [str(award.pk)]


def test_a_wrong_kind_of_key_is_refused(award, settings):
    settings.BADGE_SIGNING_KEY = "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----"
    assert client_for().get("/api/credentials/jwks").status_code == 503


def test_generate_badge_key_prints_a_usable_key(capsys, settings):
    call_command("generate_badge_key")
    settings.BADGE_SIGNING_KEY = capsys.readouterr().out
    assert client_for().get("/api/credentials/jwks").json()["keys"][0]["crv"] == "Ed25519"
