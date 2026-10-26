import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Member, Role
from apps.tenants.models import Tenant

# token string -> decoded Firebase claims. Unknown tokens are rejected like a bad signature.
TOKENS: dict[str, dict] = {}


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Create the RLS-bound runtime role in the test database (as owner)."""
    from apps.tenants.dbroles import ensure_app_role

    with django_db_blocker.unblock():
        ensure_app_role()


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
    dbroles.use_app_role()
    rls.set_bypass(True)
    yield


@pytest.fixture(autouse=True)
def fake_firebase(monkeypatch):
    """No network: tokens resolve from TOKENS; claim writes are recorded."""
    TOKENS.clear()
    claim_writes: list[dict] = []

    def verify(token: str) -> dict:
        if token not in TOKENS:
            raise ValueError("bad token")
        return TOKENS[token]

    monkeypatch.setattr("forge.firebase.verify_id_token", verify)
    monkeypatch.setattr("forge.firebase.set_role_claims", lambda **kw: claim_writes.append(kw))
    return claim_writes


def sign_in(uid: str, gcip_tenant: str | None = None) -> str:
    """Register a fake ID token for `uid` (optionally from a GCIP tenant pool)."""
    token = f"token-{uid}-{gcip_tenant}"
    TOKENS[token] = {"uid": uid, "firebase": {"tenant": gcip_tenant} if gcip_tenant else {}}
    return token


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
    return Tenant.objects.create(
        id="lakewood", name="Lakewood University", status="active", gcip_tenant_id="lakewood-pool"
    )


@pytest.fixture
def acme(db):
    """A tenant on the shared project-level pool (no GCIP tenant)."""
    return Tenant.objects.create(id="acme", name="Acme", status="active")


def make_member(tenant, uid, role=Role.LEARNER, **kw) -> Member:
    return Member.objects.create(
        tenant=tenant, firebase_uid=uid, email=f"{uid}@example.com", role=role, **kw
    )
