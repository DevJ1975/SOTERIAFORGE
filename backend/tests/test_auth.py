import pytest
from django.contrib.auth.hashers import make_password

from apps.accounts.models import Member, Role
from apps.accounts.tokens import issue_access
from apps.audit.models import AuditEntry
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


def test_healthz_needs_no_auth():
    assert client_for().get("/healthz").json() == {"ok": True}


def test_api_requires_a_token():
    assert client_for().get("/api/me").status_code in (401, 403)


def test_rejects_a_bad_token():
    res = client_for("forged").get("/api/me")
    assert res.status_code == 401
    assert res["WWW-Authenticate"] == "Bearer"


def test_rejects_wrong_scheme(lakewood):
    make_member(lakewood, "marcus")
    res = client_for().get("/api/me", HTTP_AUTHORIZATION=f"Basic {sign_in('marcus')}")
    assert res.status_code == 401


def test_member_token_decides_the_tenant(lakewood):
    make_member(lakewood, "marcus")
    res = client_for(sign_in("marcus")).get("/api/me")
    assert res.status_code == 200
    body = res.json()
    assert body["tenant"]["id"] == "lakewood"
    assert body["member"]["role"] == "learner"
    assert body["canAuthor"] is False


def test_header_cannot_override_the_members_tenant(lakewood, acme):
    make_member(lakewood, "marcus")
    res = client_for(sign_in("marcus"), tenant="acme").get("/api/me")
    assert res.status_code == 403


def test_a_member_cannot_enter_another_tenant_with_the_header(lakewood, acme):
    # Same local-part exists in both tenants: each token still lands in its own tenant.
    make_member(lakewood, "marcus")
    outsider = make_member(acme, "wile")
    token = issue_access(outsider)
    assert client_for(token, tenant="lakewood").get("/api/me").status_code == 403
    assert client_for(token, tenant="acme").get("/api/me").status_code == 200
    assert client_for(token).get("/api/me").json()["tenant"]["id"] == "acme"


def test_token_for_a_removed_member_is_refused(lakewood):
    gone = make_member(lakewood, "gone")
    token = issue_access(gone)
    gone.delete()
    assert client_for(token).get("/api/me").status_code == 401


def test_a_password_change_invalidates_issued_tokens(lakewood):
    m = make_member(lakewood, "marcus")
    token = issue_access(m)
    assert client_for(token).get("/api/me").status_code == 200
    m.password = make_password("a-new-secret")
    m.save()
    assert client_for(token).get("/api/me").status_code == 401


def test_unknown_tenant_header_is_refused_for_superadmin():
    Member.objects.create(tenant=None, email="root@example.com", role=Role.SUPERADMIN)
    assert client_for(sign_in("root"), tenant="nope").get("/api/me").status_code == 403


def test_deactivated_member_is_refused(lakewood):
    make_member(lakewood, "gone", status=Member.Status.DEACTIVATED)
    assert client_for(sign_in("gone")).get("/api/me").status_code == 403


def test_suspended_tenant_is_refused(lakewood):
    make_member(lakewood, "marcus")
    lakewood.status = "suspended"
    lakewood.save()
    assert client_for(sign_in("marcus")).get("/api/me").status_code == 403


def test_first_sign_in_accepts_the_invite(lakewood):
    m = make_member(lakewood, "newbie", status=Member.Status.INVITED)
    assert client_for(sign_in("newbie")).get("/api/me").status_code == 200
    m.refresh_from_db()
    assert m.status == Member.Status.ACTIVE
    assert AuditEntry.objects.filter(action="member.invite.accepted", target_id=str(m.pk)).exists()


def test_superadmin_acts_in_a_named_tenant(lakewood):
    Member.objects.create(tenant=None, email="root@example.com", role=Role.SUPERADMIN)
    body = client_for(sign_in("root"), tenant="lakewood").get("/api/me").json()
    assert body["member"]["role"] == "superadmin"
    assert body["tenant"]["id"] == "lakewood"
    assert body["canAuthor"] is True
