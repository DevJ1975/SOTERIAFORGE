"""Django-issued sign-in: login, refresh rotation, logout, lockout, reset and invites."""

import re

import pytest
from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import Member, RefreshToken, Role
from conftest import client_for, make_member

PASSWORD = "correct horse battery staple"
COOKIE = settings.AUTH_COOKIE_NAME


def with_password(member: Member, password: str = PASSWORD) -> Member:
    member.set_password(password)
    member.save()
    return member


def login(email: str, password: str = PASSWORD, tenant: str | None = None, **extra):
    client = APIClient()
    body = {"email": email, "password": password, **extra}
    if tenant:
        body["tenant"] = tenant
    return client, client.post("/api/auth/login", body, format="json")


def refresh(client: APIClient, **headers):
    return client.post(
        "/api/auth/refresh", {}, format="json", **({"HTTP_X_FORGE_CLIENT": "web"} | headers)
    )


@pytest.fixture
def learner(acme):
    return with_password(make_member(acme, "ada"))


# --- login -------------------------------------------------------------------
def test_login_returns_access_and_httponly_refresh_cookie(learner):
    client, res = login("ADA@example.com", tenant="acme")  # email is case-insensitive
    assert res.status_code == 200
    assert res.data["expiresIn"] == settings.AUTH_ACCESS_TTL
    assert "refresh" not in res.data  # web clients only get the cookie
    cookie = res.cookies[COOKIE]
    assert cookie["httponly"] and cookie["path"] == "/api/auth/"

    me = client_for(res.data["access"], tenant="acme").get("/api/me")
    assert me.status_code == 200
    assert me.data["member"]["email"] == "ada@example.com"
    assert me.data["tenant"]["id"] == "acme"


def test_mobile_clients_get_the_refresh_token_in_the_body(learner):
    _, res = login("ada@example.com", tenant="acme", client="mobile")
    assert res.status_code == 200 and res.data["refresh"]


def test_wrong_password_and_unknown_email_look_the_same(learner):
    _, wrong = login("ada@example.com", "nope", tenant="acme")
    _, unknown = login("nobody@example.com", tenant="acme")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.data["detail"] == unknown.data["detail"]


def test_member_of_another_tenant_cannot_sign_in_here(learner, lakewood):
    _, res = login("ada@example.com", tenant="lakewood")
    assert res.status_code == 401


def test_access_token_is_bound_to_its_tenant(learner, lakewood):
    _, res = login("ada@example.com", tenant="acme")
    assert client_for(res.data["access"], tenant="lakewood").get("/api/me").status_code == 403


def test_lockout_after_repeated_failures(learner):
    for _ in range(settings.AUTH_LOCKOUT_ATTEMPTS):
        login("ada@example.com", "nope", tenant="acme")
    _, res = login("ada@example.com", tenant="acme")  # right password, still locked
    assert res.status_code == 429


def test_deactivated_member_cannot_sign_in(learner):
    learner.status = Member.Status.DEACTIVATED
    learner.save()
    _, res = login("ada@example.com", tenant="acme")
    assert res.status_code == 401


def test_superadmin_signs_in_without_a_tenant_and_can_act_in_one(acme):
    with_password(
        Member.objects.create(tenant=None, email="root@example.com", role=Role.SUPERADMIN)
    )
    _, res = login("root@example.com")
    assert res.status_code == 200
    me = client_for(res.data["access"], tenant="acme").get("/api/me")
    assert me.status_code == 200 and me.data["tenant"]["id"] == "acme"


def test_tampered_access_token_is_rejected(learner):
    _, res = login("ada@example.com", tenant="acme")
    bad = res.data["access"][:-2] + "xx"
    assert client_for(bad, tenant="acme").get("/api/me").status_code in (401, 403)


# --- refresh / logout ----------------------------------------------------------
def test_refresh_rotates_and_reuse_revokes_the_family(learner):
    client, res = login("ada@example.com", tenant="acme")
    first = res.cookies[COOKIE].value

    rotated = refresh(client)
    assert rotated.status_code == 200 and rotated.data["access"]
    second = rotated.cookies[COOKIE].value
    assert second != first

    # Replaying the spent token (as a thief would) ends the whole chain.
    thief = APIClient()
    thief.cookies[COOKIE] = first
    assert refresh(thief).status_code == 401
    assert refresh(client).status_code == 401  # the legitimate newer token is revoked too
    assert not RefreshToken.objects.filter(member=learner, revoked_at__isnull=True).exists()


def test_cookie_refresh_requires_the_client_header(learner):
    client, _ = login("ada@example.com", tenant="acme")
    res = client.post("/api/auth/refresh", {}, format="json")
    assert res.status_code == 403


def test_logout_revokes_the_refresh_token(learner):
    client, _ = login("ada@example.com", tenant="acme")
    assert client.post("/api/auth/logout", {}, format="json").status_code == 204
    assert refresh(client).status_code == 401


# --- password reset / invites --------------------------------------------------
def _link_token() -> str:
    return re.search(r"token=([\w-]+)", mail.outbox[-1].body).group(1)


def test_reset_request_never_reveals_whether_the_account_exists(learner):
    known = APIClient().post(
        "/api/auth/password-reset", {"email": "ada@example.com", "tenant": "acme"}, format="json"
    )
    unknown = APIClient().post(
        "/api/auth/password-reset", {"email": "x@example.com", "tenant": "acme"}, format="json"
    )
    assert known.status_code == unknown.status_code == 202
    assert len(mail.outbox) == 1
    assert "https://acme.soteriaforge.com/reset-password?token=" in mail.outbox[0].body


def test_reset_sets_the_password_and_ends_existing_sessions(learner):
    client, res = login("ada@example.com", tenant="acme")
    old_access = res.data["access"]
    APIClient().post(
        "/api/auth/password-reset", {"email": "ada@example.com", "tenant": "acme"}, format="json"
    )
    token = _link_token()

    weak = APIClient().post(
        "/api/auth/password-reset/confirm", {"token": token, "password": "123"}, format="json"
    )
    assert weak.status_code == 400

    new_password = "a much better passphrase"
    ok = APIClient().post(
        "/api/auth/password-reset/confirm",
        {"token": token, "password": new_password},
        format="json",
    )
    assert ok.status_code == 204
    # Old sessions are gone: refresh revoked, and the access token no longer matches.
    assert refresh(client).status_code == 401
    assert client_for(old_access, tenant="acme").get("/api/me").status_code == 401
    assert login("ada@example.com", new_password, tenant="acme")[1].status_code == 200
    # The link works once.
    again = APIClient().post(
        "/api/auth/password-reset/confirm",
        {"token": token, "password": "yet another long passphrase"},
        format="json",
    )
    assert again.status_code == 400


def test_invited_member_sets_a_first_password_and_becomes_active(acme):
    invited = make_member(acme, "grace", status=Member.Status.INVITED)
    APIClient().post(
        "/api/auth/password-reset", {"email": "grace@example.com", "tenant": "acme"}, format="json"
    )
    assert "accept-invite?token=" in mail.outbox[-1].body
    res = APIClient().post(
        "/api/auth/password-reset/confirm",
        {"token": _link_token(), "password": "grace hopper compiles"},
        format="json",
    )
    assert res.status_code == 204
    invited.refresh_from_db()
    assert invited.status == Member.Status.ACTIVE and invited.check_password(
        "grace hopper compiles"
    )


def test_signed_in_member_changes_their_password(learner):
    client, res = login("ada@example.com", tenant="acme")
    api = client_for(res.data["access"], tenant="acme")
    bad = api.post("/api/auth/password", {"current": "nope", "password": "x" * 20}, format="json")
    assert bad.status_code == 400
    ok = api.post(
        "/api/auth/password",
        {"current": PASSWORD, "password": "a brand new passphrase"},
        format="json",
    )
    assert ok.status_code == 200 and ok.data["access"]
    assert refresh(client).status_code == 401  # the earlier session ended
