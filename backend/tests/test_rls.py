"""Row-level security: tenant isolation holds even when a query has no tenant filter."""

import pytest
from django.db import connection, transaction

from apps.accounts.models import Member
from apps.audit.models import AuditEntry, record
from apps.tenants import rls
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


@pytest.fixture
def two_tenants(lakewood, acme):
    make_member(lakewood, "marcus")
    make_member(lakewood, "jamil")
    make_member(acme, "wile")


def test_runs_as_a_role_rls_applies_to():
    with connection.cursor() as cur:
        cur.execute(
            "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        )
        assert cur.fetchone() == ("forge_app_test", False, False)


def test_unscoped_session_sees_no_tenant_rows(two_tenants):
    rls.set_bypass(False)
    assert Member.objects.count() == 0


def test_scoped_session_sees_only_its_tenant(two_tenants):
    rls.set_bypass(False)
    rls.set_tenant("lakewood")
    assert set(Member.objects.values_list("email", flat=True)) == {
        "marcus@example.com",
        "jamil@example.com",
    }
    rls.set_tenant("acme")
    assert list(Member.objects.values_list("email", flat=True)) == ["wile@example.com"]


def test_cannot_write_rows_into_another_tenant(two_tenants, acme):
    rls.set_bypass(False)
    rls.set_tenant("lakewood")
    with pytest.raises(Exception, match="row-level security"), transaction.atomic():
        Member.objects.create(tenant=acme, email="sneaky@example.com")
    with pytest.raises(Exception, match="row-level security"), transaction.atomic():
        record(action="forged", tenant=acme)


def test_cannot_move_a_row_to_another_tenant(two_tenants, acme):
    rls.set_bypass(False)
    rls.set_tenant("lakewood")
    with pytest.raises(Exception, match="row-level security"), transaction.atomic():
        Member.objects.filter(email="marcus@example.com").update(tenant=acme)


def test_requests_are_scoped_and_the_session_is_restored(two_tenants, lakewood):
    rls.set_bypass(True)
    res = client_for(sign_in("marcus")).get("/api/me")
    assert res.status_code == 200
    # Middleware restored the test's bypass, so every tenant is visible again.
    assert Member.objects.count() == 3


def test_invite_acceptance_audit_lands_in_the_member_tenant(lakewood):
    m = make_member(lakewood, "newbie", status=Member.Status.INVITED)
    client_for(sign_in("newbie")).get("/api/me")
    entry = AuditEntry.objects.get(action="member.invite.accepted")
    assert entry.tenant_id == "lakewood"
    assert entry.target_id == str(m.pk)
