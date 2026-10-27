"""Admin endpoints that replaced Cloud Functions: invites, status, data rights,
branding, tenant provisioning, games, and lesson/module deletion."""

import pytest
from django.core import mail

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry
from apps.games.models import Game
from apps.learning.models import Course, Enrollment, Lesson, LessonProgress, Module
from apps.tenants.models import Tenant
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "admin": make_member(lakewood, "jamil", Role.TENANT_ADMIN),
        "instructor": make_member(lakewood, "ta", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "marcus"),
    }


def as_(uid):
    return client_for(sign_in(uid))


@pytest.fixture
def superadmin(db):
    return Member.objects.create(email="root@example.com", role=Role.SUPERADMIN, tenant=None)


def root():
    return client_for(sign_in("root"))


# --- invites and status ----------------------------------------------------
def test_admin_invites_a_member_and_gets_the_link(people):
    res = as_("jamil").post(
        "/api/members/invite",
        {"email": "New@Example.com", "role": "learner", "displayName": "New"},
        format="json",
    )
    assert res.status_code == 201
    assert "/accept-invite?token=" in res.json()["inviteLink"]
    member = Member.objects.get(email="new@example.com")
    assert member.status == Member.Status.INVITED and member.tenant_id == "lakewood"
    assert len(mail.outbox) == 1
    assert AuditEntry.objects.filter(action="member.invited").exists()


def test_invite_rejects_duplicates_superadmin_role_and_non_admins(people):
    admin = as_("jamil")
    body = {"email": "marcus@example.com", "role": "learner"}
    assert admin.post("/api/members/invite", body, format="json").status_code == 400
    body = {"email": "x@example.com", "role": "superadmin"}
    assert admin.post("/api/members/invite", body, format="json").status_code == 400
    ok = {"email": "x@example.com", "role": "learner"}
    assert as_("ta").post("/api/members/invite", ok, format="json").status_code == 403
    assert as_("marcus").post("/api/members/invite", ok, format="json").status_code == 403


def test_deactivate_ends_sessions_and_cannot_target_self(people):
    admin = as_("jamil")
    learner = people["learner"]
    res = admin.patch(f"/api/members/{learner.pk}/status", {"status": "deactivated"}, format="json")
    assert res.status_code == 200
    learner.refresh_from_db()
    assert learner.status == Member.Status.DEACTIVATED
    own = admin.patch(
        f"/api/members/{people['admin'].pk}/status", {"status": "deactivated"}, format="json"
    )
    assert own.status_code == 403


def test_cannot_reactivate_a_member_who_never_accepted_their_invite(people):
    invited = Member.objects.create(
        tenant=people["admin"].tenant, email="p@example.com", status=Member.Status.INVITED
    )
    res = as_("jamil").patch(
        f"/api/members/{invited.pk}/status", {"status": "active"}, format="json"
    )
    assert res.status_code == 400


# --- data rights -----------------------------------------------------------
def test_members_export_their_own_data_but_not_a_colleagues(people):
    mine = as_("marcus").get(f"/api/members/{people['learner'].pk}/export")
    assert mine.status_code == 200 and mine.json()["member"]["email"] == "marcus@example.com"
    assert mine["Cache-Control"] == "no-store"
    assert as_("marcus").get(f"/api/members/{people['instructor'].pk}/export").status_code == 403
    assert as_("jamil").get(f"/api/members/{people['learner'].pk}/export").status_code == 200


def test_tenant_admin_cannot_export_another_tenant(people, acme):
    outsider = make_member(acme, "outsider")
    assert as_("jamil").get(f"/api/members/{outsider.pk}/export").status_code == 404


def test_erasure_is_superadmin_only_and_needs_confirmation(people, superadmin):
    learner = people["learner"]
    url = f"/api/members/{learner.pk}/erase"
    assert as_("jamil").post(url, {"confirm": True}, format="json").status_code == 403
    assert root().post(url, {"confirm": False}, format="json").status_code == 400
    assert root().post(url, {}, format="json").status_code == 400
    assert root().post(url, {"confirm": True}, format="json").status_code == 204
    learner.refresh_from_db()
    assert learner.display_name == "Deleted user" and learner.password == ""
    assert learner.email.endswith("@deleted.invalid")
    assert learner.status == Member.Status.DEACTIVATED
    assert AuditEntry.objects.filter(action="data.erasure").exists()


# --- branding and tenants --------------------------------------------------
def test_branding_update_validates_and_is_limited_to_own_tenant_admins(people, acme):
    admin = as_("jamil")
    good = {"colors": {"--assurance-primary": "#112233"}, "fontFamily": "Inter, sans-serif"}
    res = admin.put("/api/tenants/lakewood/branding", good, format="json")
    assert res.status_code == 200
    assert Tenant.objects.get(pk="lakewood").branding["colors"] == good["colors"]
    for bad in (
        {"colors": {"--x": "red; background: url(//evil)"}},
        {"colors": {"primary": "#fff"}},
        {"logoUrl": "http://insecure.example.com/logo.png"},
        {"fontFamily": "x; } body { display:none"},
    ):
        assert admin.put("/api/tenants/lakewood/branding", bad, format="json").status_code == 400
    assert admin.put("/api/tenants/acme/branding", good, format="json").status_code == 403
    assert as_("ta").put("/api/tenants/lakewood/branding", good, format="json").status_code == 403


def test_superadmin_provisions_and_manages_tenants(people, superadmin):
    res = root().post(
        "/api/tenants",
        {"id": "newco", "name": "NewCo", "adminEmail": "boss@newco.com"},
        format="json",
    )
    assert res.status_code == 201 and res.json()["status"] == "active"
    boss = Member.objects.get(email="boss@newco.com")
    assert boss.role == Role.TENANT_ADMIN and boss.status == Member.Status.INVITED
    again = root().post("/api/tenants", {"id": "newco", "name": "Dup"}, format="json")
    assert again.status_code == 400
    bad = root().post("/api/tenants", {"id": "Bad_Id", "name": "x"}, format="json")
    assert bad.status_code == 400
    res = root().patch("/api/tenants/newco", {"status": "suspended"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "suspended"
    assert {t["id"] for t in root().get("/api/tenants").json()} >= {"newco", "lakewood"}


def test_tenant_management_is_superadmin_only(people):
    assert as_("jamil").get("/api/tenants").status_code == 403
    assert (
        as_("jamil").post("/api/tenants", {"id": "x", "name": "x"}, format="json").status_code
        == 403
    )
    assert (
        as_("jamil")
        .patch("/api/tenants/lakewood", {"status": "archived"}, format="json")
        .status_code
        == 403
    )


# --- games -----------------------------------------------------------------
def test_staff_manage_games_within_their_tenant(people, acme):
    ta = as_("ta")
    res = ta.post(
        "/api/games",
        {"title": "Match", "engine": "phaser", "config": {"kind": "match_pairs"}},
        format="json",
    )
    assert res.status_code == 201
    game_id = res.json()["id"]
    assert (
        ta.patch(f"/api/games/{game_id}", {"title": "Match 2"}, format="json").json()["title"]
        == "Match 2"
    )
    assert as_("marcus").post("/api/games", {"title": "x"}, format="json").status_code == 403
    assert as_("marcus").get("/api/games").status_code == 200
    other = Game.objects.create(tenant=acme, title="Theirs")
    assert ta.get(f"/api/games/{other.pk}").status_code == 404
    bad = ta.post("/api/games", {"title": "x", "config": {"kind": "nope"}}, format="json")
    assert bad.status_code == 400
    assert ta.delete(f"/api/games/{game_id}").status_code == 204


def test_a_game_a_lesson_uses_cannot_be_deleted(people, lakewood):
    game = Game.objects.create(tenant=lakewood, title="Used")
    course = Course.objects.create(tenant=lakewood, title="C")
    module = Module.objects.create(tenant=lakewood, course=course, title="M")
    Lesson.objects.create(
        tenant=lakewood, module=module, title="L", content_type="game", asset_ref=str(game.pk)
    )
    assert as_("ta").delete(f"/api/games/{game.pk}").status_code == 409


# --- deleting authored content ---------------------------------------------
def test_unused_lessons_and_modules_delete_but_ones_with_progress_do_not(people, lakewood):
    course = Course.objects.create(tenant=lakewood, title="C", status="published")
    module = Module.objects.create(tenant=lakewood, course=course, title="M")
    empty = Lesson.objects.create(tenant=lakewood, module=module, title="E", content_type="video")
    used = Lesson.objects.create(tenant=lakewood, module=module, title="U", content_type="video")
    enrollment = Enrollment.objects.create(tenant=lakewood, course=course, member=people["learner"])
    LessonProgress.objects.create(tenant=lakewood, enrollment=enrollment, lesson=used)
    ta = as_("ta")
    assert ta.delete(f"/api/lessons/{empty.pk}").status_code == 204
    assert ta.delete(f"/api/lessons/{used.pk}").status_code == 409
    assert ta.delete(f"/api/modules/{module.pk}").status_code == 409
    assert as_("marcus").delete(f"/api/lessons/{used.pk}").status_code == 403
