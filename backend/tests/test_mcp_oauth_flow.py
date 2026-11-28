"""The OAuth flow Claude and ChatGPT run: register, sign in, consent, PKCE code exchange."""

import base64
import hashlib
import json
import secrets
from urllib.parse import parse_qs, urlparse

import pytest

from apps.accounts.models import Member, Role
from conftest import make_member
from tests.mcp_harness import call, data

pytestmark = pytest.mark.django_db

CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback"
PASSWORD = "correct horse battery staple"


def member_with_password(tenant, uid, role=Role.INSTRUCTOR, **kw) -> Member:
    member = make_member(tenant, uid, role, **kw)
    member.set_password(PASSWORD)
    member.save()
    return member


def sign_in_page(client, uid, org="lakewood", password=PASSWORD, next_url=""):
    return client.post(
        "/oauth/login/",
        {"email": f"{uid}@example.com", "password": password, "org": org, "next": next_url},
    )


def register(client, redirect_uris):
    return client.post(
        "/oauth/register/",
        data=json.dumps(
            {
                "client_name": "Claude",
                "redirect_uris": redirect_uris,
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            }
        ),
        content_type="application/json",
    )


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def authorize_url(client_id, challenge) -> str:
    return (
        f"/oauth/authorize/?response_type=code&client_id={client_id}&redirect_uri={CLAUDE_CALLBACK}"
        f"&scope=forge&state=xyz&code_challenge={challenge}&code_challenge_method=S256"
        "&resource=http://localhost:8000/mcp"
    )


def approve(client, authorize) -> dict:
    page = client.get(authorize)
    assert page.status_code == 200
    form = {k: v for k, v in page.context["form"].initial.items() if v is not None}
    response = client.post(authorize, {**form, "allow": "Authorize"})
    return parse_qs(urlparse(response["Location"]).query)


@pytest.mark.parametrize(
    "uris",
    [
        ["https://evil.example/callback"],
        ["http://claude.ai/api/mcp/auth_callback"],
        [CLAUDE_CALLBACK, "https://evil.example/callback"],
        [],
    ],
)
def test_registration_only_for_allowed_redirects(client, uris):
    assert register(client, uris).status_code in (400, 401, 403)


def test_registration_only_for_the_authorization_code_grant(client):
    response = client.post(
        "/oauth/register/",
        data=json.dumps(
            {"redirect_uris": [CLAUDE_CALLBACK], "grant_types": ["client_credentials"]}
        ),
        content_type="application/json",
    )
    assert response.status_code in (400, 401, 403)


def test_loopback_registration_for_desktop_clients(client):
    assert register(client, ["http://127.0.0.1:33418/callback"]).status_code == 201


def test_full_flow_issues_a_token_that_calls_tools(client, lakewood):
    member = member_with_password(lakewood, "ana", status=Member.Status.INVITED)
    client_id = register(client, [CLAUDE_CALLBACK]).json()["client_id"]
    verifier, challenge = pkce()
    authorize = authorize_url(client_id, challenge)

    # Not signed in: sent to the Forge sign-in page.
    response = client.get(authorize)
    assert response.status_code == 302 and response["Location"].startswith("/oauth/login/")

    response = sign_in_page(client, "ana", next_url=authorize)
    assert response.status_code == 302 and response["Location"] == authorize
    member.refresh_from_db()
    assert member.status == Member.Status.ACTIVE  # first sign-in accepts the invite

    # Consent page names the membership the app will act as.
    page = client.get(authorize)
    assert b"ana@example.com" in page.content and b"Lakewood University" in page.content

    query = approve(client, authorize)
    assert query["state"] == ["xyz"]
    token = client.post(
        "/oauth/token/",
        {
            "grant_type": "authorization_code",
            "code": query["code"][0],
            "redirect_uri": CLAUDE_CALLBACK,
            "client_id": client_id,
            "code_verifier": verifier,
            "resource": "http://localhost:8000/mcp",
        },
    ).json()
    assert token["token_type"] == "Bearer" and token["refresh_token"]

    course = data(
        call(token["access_token"], "forge_create_course_draft", title="Hazard communication")
    )
    assert course["status"] == "draft"


def test_wrong_verifier_gets_no_token(client, lakewood):
    member_with_password(lakewood, "ana")
    client_id = register(client, [CLAUDE_CALLBACK]).json()["client_id"]
    _verifier, challenge = pkce()
    authorize = authorize_url(client_id, challenge)
    sign_in_page(client, "ana")
    code = approve(client, authorize)["code"][0]
    response = client.post(
        "/oauth/token/",
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CLAUDE_CALLBACK,
            "client_id": client_id,
            "code_verifier": "wrong" * 10,
        },
    )
    assert response.status_code == 400


def test_sign_in_rejects_wrong_passwords_and_strangers(client, lakewood, acme):
    member_with_password(lakewood, "ana")
    for response in (
        sign_in_page(client, "ana", password="not it"),
        sign_in_page(client, "stranger"),
        sign_in_page(client, "ana", org="acme"),  # a member of another organization
        sign_in_page(client, "ana", org="nowhere"),
    ):
        assert response.status_code == 401
        assert b"Invalid email or password." in response.content
    assert "_auth_user_id" not in client.session


def test_sign_in_shares_the_api_lockout(client, lakewood, settings):
    member = member_with_password(lakewood, "ana")
    for _ in range(settings.AUTH_LOCKOUT_ATTEMPTS):
        sign_in_page(client, "ana", password="not it")
    member.refresh_from_db()
    assert member.locked_until is not None
    assert b"Too many failed attempts" in sign_in_page(client, "ana").content


def test_deactivated_members_and_suspended_orgs_cant_sign_in(client, lakewood):
    member_with_password(lakewood, "gone", status=Member.Status.DEACTIVATED)
    assert sign_in_page(client, "gone").status_code == 401
    member_with_password(lakewood, "ana")
    lakewood.status = "suspended"
    lakewood.save()
    assert b"isn&#x27;t active" in sign_in_page(client, "ana").content


def test_sign_in_never_redirects_off_site(client, lakewood):
    member_with_password(lakewood, "ana")
    response = sign_in_page(client, "ana", next_url="https://evil.example/")
    assert response.status_code == 302 and response["Location"] == "/"
