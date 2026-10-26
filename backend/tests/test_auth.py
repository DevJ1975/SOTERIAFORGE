import pytest

from apps.accounts.models import Member, Role
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


def test_gcip_pool_decides_the_tenant(lakewood):
    make_member(lakewood, "marcus")
    res = client_for(sign_in("marcus", "lakewood-pool")).get("/api/me")
    assert res.status_code == 200
    body = res.json()
    assert body["tenant"]["id"] == "lakewood"
    assert body["member"]["role"] == "learner"
    assert body["canAuthor"] is False


def test_header_cannot_override_the_gcip_tenant(lakewood, acme):
    make_member(lakewood, "marcus")
    res = client_for(sign_in("marcus", "lakewood-pool"), tenant="acme").get("/api/me")
    assert res.status_code == 403


def test_unlinked_gcip_pool_is_refused(lakewood):
    res = client_for(sign_in("marcus", "unknown-pool")).get("/api/me")
    assert res.status_code == 403


def test_shared_pool_tenant_needs_membership(acme):
    token = sign_in("wile")
    assert client_for(token, tenant="acme").get("/api/me").status_code == 403
    make_member(acme, "wile")
    assert client_for(token, tenant="acme").get("/api/me").status_code == 200


def test_shared_pool_cannot_enter_a_gcip_tenant(lakewood):
    # Same uid string exists in the lakewood pool, but this token is from the project pool.
    make_member(lakewood, "marcus")
    assert client_for(sign_in("marcus"), tenant="lakewood").get("/api/me").status_code == 403


def test_deactivated_member_is_refused(lakewood):
    make_member(lakewood, "gone", status=Member.Status.DEACTIVATED)
    assert client_for(sign_in("gone", "lakewood-pool")).get("/api/me").status_code == 403


def test_suspended_tenant_is_refused(lakewood):
    make_member(lakewood, "marcus")
    lakewood.status = "suspended"
    lakewood.save()
    assert client_for(sign_in("marcus", "lakewood-pool")).get("/api/me").status_code == 403


def test_first_sign_in_accepts_the_invite(lakewood):
    m = make_member(lakewood, "newbie", status=Member.Status.INVITED)
    assert client_for(sign_in("newbie", "lakewood-pool")).get("/api/me").status_code == 200
    m.refresh_from_db()
    assert m.status == Member.Status.ACTIVE
    assert AuditEntry.objects.filter(action="member.invite.accepted", target_id=str(m.pk)).exists()


def test_superadmin_acts_in_a_named_tenant(lakewood):
    Member.objects.create(
        tenant=None, firebase_uid="root", email="root@sfg.example", role=Role.SUPERADMIN
    )
    body = client_for(sign_in("root"), tenant="lakewood").get("/api/me").json()
    assert body["member"]["role"] == "superadmin"
    assert body["tenant"]["id"] == "lakewood"
    assert body["canAuthor"] is True
