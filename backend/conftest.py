import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Member, Role
from apps.accounts.tokens import issue_access
from apps.tenants.models import Tenant

TEST_APP_ROLE = "forge_app_test"


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Create an RLS-bound role for tests (as owner).

    Roles are cluster-wide, so tests use their own role and never alter the real
    runtime role (`forge_app`) of a database on the same server.
    """
    from apps.tenants.dbroles import ensure_app_role

    with django_db_blocker.unblock():
        ensure_app_role(TEST_APP_ROLE)


@pytest.fixture(autouse=True)
def rls_bypass(request):
    """Fixtures and assertions see every tenant; RlsMiddleware scopes each request.

    Tests that check RLS itself switch it off (`rls.set_bypass(False)`).
    """
    if "db" not in request.fixturenames and not request.node.get_closest_marker("django_db"):
        yield
        return
    request.getfixturevalue("db")
    from apps.tenants import dbroles, rls

    # Run as the runtime role: the test DB user is a superuser, which skips RLS.
    dbroles.use_app_role(TEST_APP_ROLE)
    rls.set_bypass(True)
    yield


def sign_in(uid: str) -> str:
    """A real Django access token for the member made with `make_member(tenant, uid)`.

    Members are addressed by their local-part (`<uid>@example.com`), so a test reads the
    same as it did when the uid was an identity-provider id.
    """
    from apps.tenants import rls

    with rls.bypass():
        member = Member.objects.get(email=f"{uid}@example.com")
    return issue_access(member)


def client_for(token: str | None = None, tenant: str | None = None) -> APIClient:
    client = APIClient()
    headers = {}
    if token:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    if tenant:
        headers["HTTP_X_FORGE_TENANT"] = tenant
    client.credentials(**headers)
    return client


@pytest.fixture
def lakewood(db):
    return Tenant.objects.create(id="lakewood", name="Lakewood University", status="active")


@pytest.fixture
def acme(db):
    """A second tenant, for cross-tenant isolation checks."""
    return Tenant.objects.create(id="acme", name="Acme", status="active")


def make_member(tenant, uid, role=Role.LEARNER, **kw) -> Member:
    return Member.objects.create(tenant=tenant, email=f"{uid}@example.com", role=role, **kw)
