"""Member listing and role changes. Rules ported from the `setMemberRole` Cloud Function."""

import pytest
from django.db import IntegrityError, connection, transaction

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry, record
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff(lakewood):
    return {
        "admin": make_member(lakewood, "jamil", Role.TENANT_ADMIN),
        "instructor": make_member(lakewood, "ta", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "marcus"),
    }


def as_(uid):
    return client_for(sign_in(uid))


def role_url(member):
    return f"/api/members/{member.pk}/role"


def test_staff_list_only_their_tenant(staff, acme):
    make_member(acme, "outsider")
    emails = {m["email"] for m in as_("ta").get("/api/members").json()}
    assert emails == {"jamil@example.com", "ta@example.com", "marcus@example.com"}


def test_learners_cannot_list_members(staff):
    assert as_("marcus").get("/api/members").status_code == 403


def test_tenant_admin_changes_a_role(staff):
    res = as_("jamil").patch(role_url(staff["learner"]), {"role": "instructor"}, format="json")
    assert res.status_code == 200
    assert res.json()["role"] == "instructor"
    staff["learner"].refresh_from_db()
    assert staff["learner"].role == Role.INSTRUCTOR

    entry = AuditEntry.objects.get(action="member.role.set")
    assert entry.actor == staff["admin"]
    assert entry.details == {"old": "learner", "new": "instructor"}
    # No claims to mirror: the new role applies on the member's very next request.
    assert as_("marcus").get("/api/me").json()["member"]["role"] == "instructor"


def test_instructors_cannot_change_roles(staff):
    res = as_("ta").patch(role_url(staff["learner"]), {"role": "tenant_admin"}, format="json")
    assert res.status_code == 403
    staff["learner"].refresh_from_db()
    assert staff["learner"].role == Role.LEARNER


def test_nobody_mints_superadmin_through_the_api(staff):
    res = as_("jamil").patch(role_url(staff["learner"]), {"role": "superadmin"}, format="json")
    assert res.status_code == 400


def test_cannot_change_own_role(staff):
    res = as_("jamil").patch(role_url(staff["admin"]), {"role": "learner"}, format="json")
    assert res.status_code == 403


def test_cannot_reach_another_tenants_member(staff, acme):
    outsider = make_member(acme, "outsider")
    res = as_("jamil").patch(role_url(outsider), {"role": "tenant_admin"}, format="json")
    assert res.status_code == 404
    outsider.refresh_from_db()
    assert outsider.role == Role.LEARNER


def test_superadmin_needs_no_tenant_and_others_need_one(lakewood):
    with pytest.raises(IntegrityError), transaction.atomic():
        Member.objects.create(tenant=lakewood, email="x@example.com", role=Role.SUPERADMIN)
    with pytest.raises(IntegrityError), transaction.atomic():
        Member.objects.create(tenant=None, email="y@example.com", role=Role.LEARNER)


def test_audit_log_is_append_only_in_python_and_in_postgres(lakewood):
    entry = record(action="test.thing", tenant=lakewood)
    with pytest.raises(RuntimeError):
        entry.save()
    with pytest.raises(RuntimeError):
        entry.delete()

    tamper = [
        ("UPDATE audit_auditentry SET action = 'tampered' WHERE id = %s", [entry.pk]),
        ("DELETE FROM audit_auditentry WHERE id = %s", [entry.pk]),
    ]
    # The runtime role has no UPDATE/DELETE grant on the table at all...
    for statement, params in tamper:
        with (
            pytest.raises(Exception, match="permission denied"),
            transaction.atomic(),
            connection.cursor() as cur,
        ):
            cur.execute(statement, params)
    # ...and even the owner is stopped by the trigger.
    with connection.cursor() as cur:
        cur.execute("RESET ROLE")
    for statement, params in tamper:
        with (
            pytest.raises(Exception, match="append-only"),
            transaction.atomic(),
            connection.cursor() as cur,
        ):
            cur.execute(statement, params)
