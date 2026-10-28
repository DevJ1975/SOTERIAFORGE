"""Mission badges: automatic rules on completion, instructor sign-off, isolation."""

import pytest

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.gamification.badges import ensure_default_badges
from apps.gamification.models import Badge, BadgeAward
from conftest import client_for, make_member, sign_in
from tests.content import build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "admin": make_member(lakewood, "admin", Role.TENANT_ADMIN),
        "learner": make_member(lakewood, "learner"),
        "peer": make_member(lakewood, "peer"),
    }


@pytest.fixture
def content(lakewood, people):
    ensure_default_badges(lakewood)
    return build_course(lakewood, people["teacher"])


def as_(uid):
    return client_for(sign_in(uid))


@pytest.fixture
def learner(content):
    client = as_("learner")
    client.post(f"/api/courses/{content.course.pk}/enroll")
    return client


def by_key(rows):
    return {r["key"]: r for r in rows}


def test_the_starter_catalog_has_eight_badges_and_credentials_are_manual(lakewood):
    ensure_default_badges(lakewood)
    ensure_default_badges(lakewood)  # idempotent
    assert Badge.objects.filter(tenant=lakewood).count() == 8
    credential = Badge.objects.get(tenant=lakewood, kind="credential")
    assert credential.rule == "manual"


def test_a_new_member_sees_every_badge_locked(content, learner):
    rows = by_key(learner.get("/api/me/badges").json())
    assert len(rows) == 8
    assert {r["state"] for r in rows.values()} == {"locked"}
    assert rows["operator"]["progress"] == {"current": 0, "target": 5}
    assert rows["crew-lead"]["progress"] is None


def test_the_first_completion_earns_recruit_and_reports_it_once(content, learner, people):
    first = learner.post(f"/api/lessons/{content.video.pk}/complete").json()
    assert [b["key"] for b in first["award"]["badges"]] == ["recruit"]
    assert BadgeAward.objects.filter(member=people["learner"]).count() == 1
    replay = learner.post(f"/api/lessons/{content.video.pk}/complete").json()
    assert replay["award"] is None
    assert BadgeAward.objects.filter(member=people["learner"]).count() == 1
    rows = by_key(learner.get("/api/me/badges").json())
    assert rows["recruit"]["state"] == "earned" and rows["recruit"]["earnedAt"]
    assert rows["operator"]["state"] == "progress"
    assert rows["operator"]["progress"] == {"current": 1, "target": 5}
    assert AuditEntry.objects.filter(action="gamification.badge.awarded").count() == 1


def test_a_retired_badge_is_not_awarded(content, learner, people):
    Badge.objects.filter(key="recruit").update(active=False)
    first = learner.post(f"/api/lessons/{content.video.pk}/complete").json()
    assert first["award"]["badges"] == []
    assert "recruit" not in by_key(learner.get("/api/me/badges").json())


def test_other_members_progress_is_not_shared(content, learner, people):
    learner.post(f"/api/lessons/{content.video.pk}/complete")
    peer = as_("peer").get("/api/me/badges").json()
    assert {r["state"] for r in by_key(peer).values()} == {"locked"}


def test_staff_sign_off_a_credential_and_it_shows_as_credential(content, learner, people):
    credential = Badge.objects.get(kind="credential")
    url = f"/api/badges/{credential.pk}/award"
    body = {"memberId": str(people["learner"].pk)}
    assert as_("learner").post(url, body, format="json").status_code == 403
    assert as_("teacher").post(url, body, format="json").status_code == 201
    assert as_("teacher").post(url, body, format="json").status_code == 200  # already held
    row = by_key(learner.get("/api/me/badges").json())["ai-ready-professional"]
    assert row["state"] == "credential"
    award = BadgeAward.objects.get(member=people["learner"], badge=credential)
    assert award.awarded_by == people["teacher"]


def test_sign_off_is_limited_to_active_learners_of_the_tenant(content, people, acme):
    outsider = make_member(acme, "outsider")
    badge = Badge.objects.get(key="crew-lead")
    url = f"/api/badges/{badge.pk}/award"
    teacher = as_("teacher")
    assert teacher.post(url, {"memberId": str(outsider.pk)}, format="json").status_code == 404
    res = teacher.post(url, {"memberId": str(people["teacher"].pk)}, format="json")
    assert res.status_code == 400  # staff aren't awarded learner badges


def test_staff_manage_the_catalog_but_credentials_must_stay_manual(content, people):
    teacher = as_("teacher")
    res = teacher.post(
        "/api/badges",
        {"key": "sharpshooter", "name": "Sharpshooter", "rule": "level", "target": 5},
        format="json",
    )
    assert res.status_code == 201
    dup = teacher.post("/api/badges", {"key": "sharpshooter", "name": "x"}, format="json")
    assert dup.status_code == 400
    bad = teacher.post(
        "/api/badges",
        {"key": "cred", "name": "Cred", "kind": "credential", "rule": "level", "target": 2},
        format="json",
    )
    assert bad.status_code == 400
    zero = teacher.post(
        "/api/badges",
        {"key": "z", "name": "Z", "rule": "level", "target": 0},
        format="json",
    )
    assert zero.status_code == 400
    assert (
        as_("learner").post("/api/badges", {"key": "k", "name": "n"}, format="json").status_code
        == 403
    )
    assert as_("learner").get("/api/badges").status_code == 403


def test_a_badge_members_hold_cannot_be_deleted_only_retired(content, learner, people):
    learner.post(f"/api/lessons/{content.video.pk}/complete")
    recruit = Badge.objects.get(key="recruit")
    teacher = as_("teacher")
    assert teacher.delete(f"/api/badges/{recruit.pk}").status_code == 400
    assert (
        teacher.patch(f"/api/badges/{recruit.pk}", {"active": False}, format="json").status_code
        == 200
    )
    unused = Badge.objects.get(key="blue-cell")
    assert teacher.delete(f"/api/badges/{unused.pk}").status_code == 204


def test_tenants_cannot_see_or_edit_each_others_badges(content, acme):
    ensure_default_badges(acme)
    make_member(acme, "acme_admin", Role.TENANT_ADMIN)
    theirs = Badge.objects.get(tenant=acme, key="recruit")
    teacher = as_("teacher")
    assert (
        teacher.patch(f"/api/badges/{theirs.pk}", {"name": "x"}, format="json").status_code == 404
    )
    assert teacher.delete(f"/api/badges/{theirs.pk}").status_code == 404
    assert {r["key"] for r in teacher.get("/api/badges").json()}.isdisjoint(set()) is True
    assert len(teacher.get("/api/badges").json()) == 8
