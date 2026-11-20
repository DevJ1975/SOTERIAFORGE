"""Release and code tools (platform superadmins); Railway and GitHub are faked."""

import pytest

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry
from apps.mcp import integrations
from conftest import make_member
from tests.mcp_harness import call, data, error, oauth_token

pytestmark = pytest.mark.django_db


@pytest.fixture
def root(db):
    member = Member.objects.create(tenant=None, email="root@soteriaforge.com", role=Role.SUPERADMIN)
    return oauth_token(member, None)


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(name, result=None):
        def record(*args, **kwargs):
            seen.append((name, args, kwargs))
            return result

        monkeypatch.setattr(integrations, name, record)

    fake("railway_deployments", [{"id": "d1", "status": "SUCCESS"}])
    fake("railway_logs", ["line one"])
    fake("railway_redeploy")
    fake("github", {"number": 7, "html_url": "https://github.com/x/pull/7"})
    fake(
        "github_open_pr",
        {"number": 8, "url": "https://github.com/x/pull/8", "branch": "mcp/x", "base": "b"},
    )
    return seen


def test_tenant_admins_cant_use_platform_tools(lakewood, calls):
    token = oauth_token(make_member(lakewood, "dana", Role.TENANT_ADMIN), lakewood)
    for tool, args in [
        ("forge_deploy_status", {}),
        ("forge_redeploy", {}),
        ("forge_code_read", {"path": "README.md"}),
        (
            "forge_code_propose_change",
            {"title": "x", "description": "y", "changes": [{"path": "a.txt", "content": "z"}]},
        ),
    ]:
        assert "platform admins" in error(call(token, tool, **args))
    assert calls == []


def test_deploy_status_and_logs(root, calls):
    assert data(call(root, "forge_deploy_status"))["deployments"][0]["id"] == "d1"
    assert data(call(root, "forge_deploy_logs", kind="build"))["lines"] == ["line one"]
    assert calls[-1] == ("railway_logs", ("d1",), {"build": True, "limit": 100})


def test_production_redeploy_needs_confirm(root, calls):
    assert data(call(root, "forge_redeploy", environment="production"))["done"] is False
    assert calls == []
    assert (
        data(call(root, "forge_redeploy", environment="production", confirm=True))["done"] is True
    )
    assert calls == [("railway_redeploy", ("production",), {})]
    assert AuditEntry.objects.get(action="release.redeploy").details == {
        "environment": "production"
    }


def test_release_pr_goes_staging_to_main(root, calls):
    pr = data(call(root, "forge_open_release_pr", title="Release 0.2", notes="MCP server"))
    assert pr["number"] == 7
    _name, (method, path), kwargs = calls[0]
    assert (method, path) == ("POST", "/pulls")
    assert kwargs["json"]["head"] == "feat/angular-22-upgrade"
    assert kwargs["json"]["base"] == "main"


def test_code_change_opens_a_pr_on_a_new_branch(root, calls):
    pr = data(
        call(
            root,
            "forge_code_propose_change",
            title="Fix typo in README",
            description="Spelling.",
            changes=[{"path": "README.md", "content": "# Soteria Forge\n"}],
        )
    )
    assert pr["number"] == 8
    kwargs = calls[0][2]
    assert kwargs["branch"].startswith("mcp/fix-typo-in-readme-")
    assert kwargs["base"] == "feat/angular-22-upgrade"
    assert kwargs["files"] == [{"path": "README.md", "content": "# Soteria Forge\n"}]
    assert AuditEntry.objects.get(action="code.pr.open").details["paths"] == ["README.md"]


@pytest.mark.parametrize(
    "path",
    [
        ".github/workflows/ci.yml",
        ".railway/railway.ts",
        "../etc/passwd",
        "backend/.env",
        "keys/server.pem",
    ],
)
def test_code_changes_cant_touch_ci_infra_or_secrets(root, calls, path):
    message = error(
        call(
            root,
            "forge_code_propose_change",
            title="x",
            description="y",
            changes=[{"path": path, "content": "z"}],
        )
    )
    assert "Invalid path" in message or "reviewed commit" in message
    assert calls == []


def test_platform_admin_signed_in_to_an_org_can_still_release(lakewood, calls):
    member = Member.objects.create(tenant=None, email="ops@soteriaforge.com", role=Role.SUPERADMIN)
    token = oauth_token(member, lakewood)
    assert data(call(token, "forge_redeploy"))["done"] is True
    entry = AuditEntry.objects.get(action="release.redeploy")
    assert entry.tenant_id is None  # platform action, not an action in the org
