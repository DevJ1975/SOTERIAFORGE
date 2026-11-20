"""The MCP endpoint's OAuth: discovery, bearer checks, and who a token acts as."""

import pytest

from apps.accounts.models import Member, Role
from conftest import make_member
from tests.mcp_harness import call, data, error, http_get, list_tools, oauth_token

pytestmark = pytest.mark.django_db


def test_protected_resource_metadata_points_at_django():
    body = http_get("/.well-known/oauth-protected-resource/mcp").json()
    assert body["resource"] == "http://localhost:8000/mcp"
    assert body["authorization_servers"] == ["http://localhost:8000"]
    assert body["scopes_supported"] == ["forge"]


def test_authorization_server_metadata(client):
    body = client.get("/.well-known/oauth-authorization-server").json()
    assert body["authorization_endpoint"].endswith("/oauth/authorize/")
    assert body["token_endpoint"].endswith("/oauth/token/")
    assert body["registration_endpoint"].endswith("/oauth/register/")
    assert body["code_challenge_methods_supported"] == ["S256"]


def test_no_token_is_401_with_discovery_hint():
    response = http_get("/mcp")
    assert response.status_code == 401
    assert "oauth-protected-resource/mcp" in response.headers["www-authenticate"]


def test_unknown_or_expired_token_is_401(lakewood):
    member = make_member(lakewood, "ana", Role.INSTRUCTOR)
    assert http_get("/mcp", "not-a-token").status_code == 401
    assert http_get("/mcp", oauth_token(member, lakewood, expires_in=-1)).status_code == 401


def test_token_for_another_resource_is_rejected(lakewood):
    member = make_member(lakewood, "ana", Role.INSTRUCTOR)
    token = oauth_token(member, lakewood, resource=["https://elsewhere.example/mcp"])
    assert http_get("/mcp", token).status_code == 401


def test_lists_every_tool(lakewood):
    token = oauth_token(make_member(lakewood, "ana", Role.INSTRUCTOR), lakewood)
    names = set(list_tools(token))
    assert {
        "forge_create_course_draft",
        "forge_create_quiz",
        "forge_create_game",
        "forge_import_media",
        "forge_list_members",
        "forge_redeploy",
        "forge_code_propose_change",
    } <= names
    # Publishing stays with people (docs/forge-mcp.md).
    assert not [n for n in names if "publish" in n or "delete_course" in n]


def test_deactivation_ends_access_on_the_next_call(lakewood):
    member = make_member(lakewood, "ana", Role.INSTRUCTOR)
    token = oauth_token(member, lakewood)
    assert data(call(token, "forge_list_courses")) == {"courses": []}
    Member.objects.filter(pk=member.pk).update(status=Member.Status.DEACTIVATED)
    assert "access has ended" in error(call(token, "forge_list_courses"))


def test_learners_cant_author(lakewood):
    token = oauth_token(make_member(lakewood, "lee", Role.LEARNER), lakewood)
    assert "can't author courses" in error(call(token, "forge_list_courses"))


def test_suspended_tenant_ends_access(lakewood):
    token = oauth_token(make_member(lakewood, "ana", Role.TENANT_ADMIN), lakewood)
    lakewood.status = "suspended"
    lakewood.save()
    assert "access has ended" in error(call(token, "forge_get_organization"))
