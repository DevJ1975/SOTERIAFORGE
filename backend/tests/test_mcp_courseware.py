"""Courseware tools through the real MCP endpoint: authoring, isolation, guardrails."""

import pytest

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.learning.models import Course, Lesson
from conftest import client_for, make_member, sign_in
from tests.mcp_harness import call, data, error, oauth_token

pytestmark = pytest.mark.django_db


@pytest.fixture
def ana(lakewood):
    return oauth_token(make_member(lakewood, "ana", Role.INSTRUCTOR), lakewood)


def build_course(token) -> dict:
    course = data(call(token, "forge_create_course_draft", title="Lockout/Tagout", tags=["loto"]))
    module = data(
        call(token, "forge_add_module", course_id=course["id"], title="Energy sources", label="1")
    )
    lesson = data(
        call(
            token,
            "forge_add_lesson",
            module_id=module["id"],
            title="Why LOTO matters",
            content_type="video",
            external_url="https://cdn.example.com/loto.mp4",
            estimated_minutes=5,
            key_points=[
                {"title": "Isolate every energy source", "body": "Electrical, hydraulic, stored."},
                {"title": "Verify zero energy"},
            ],
            framework_tags=["OSHA 1910.147"],
            transcript="Stored energy injures **thousands** of workers a year.",
        )
    )
    return {"course": course, "module": module, "lesson": lesson}


def test_author_a_course_end_to_end(ana):
    built = build_course(ana)
    assert built["course"]["status"] == "draft"

    course = data(call(ana, "forge_get_course", course_id=built["course"]["id"]))
    lesson = course["modules"][0]["lessons"][0]
    assert [kp["title"] for kp in lesson["keyPoints"]] == [
        "Isolate every energy source",
        "Verify zero energy",
    ]
    assert lesson["frameworkTags"] == ["OSHA 1910.147"]
    assert lesson["transcript"].startswith("Stored energy")
    assert data(call(ana, "forge_list_framework_tags"))["frameworkTags"] == [
        {"tag": "OSHA 1910.147", "lessonCount": 1}
    ]

    entries = AuditEntry.objects.order_by("created_at")
    assert list(entries.values_list("action", flat=True)) == [
        "learning.course.created",
        "learning.module.created",
        "learning.lesson.created",
    ]
    assert {e.details["via"] for e in entries} == {"mcp"}


def test_the_rest_api_serves_what_the_tools_wrote(ana, lakewood):
    built = build_course(ana)
    staff = client_for(sign_in("ana"), "lakewood")
    lesson = staff.get(f"/api/lessons/{built['lesson']['id']}").json()
    assert lesson["transcript"].startswith("Stored energy")
    assert lesson["keyPoints"][1] == {"title": "Verify zero energy", "body": ""}
    patched = staff.patch(
        f"/api/lessons/{built['lesson']['id']}", {"transcript": "New script."}, format="json"
    )
    assert patched.json()["transcript"] == "New script."


def test_update_only_changes_what_is_passed(ana):
    built = build_course(ana)
    updated = data(
        call(
            ana, "forge_update_lesson", lesson_id=built["lesson"]["id"], title="Why lockout matters"
        )
    )
    assert updated["title"] == "Why lockout matters"
    assert len(updated["keyPoints"]) == 2
    assert updated["transcript"].startswith("Stored energy")


def test_reorder_needs_every_module_once(ana):
    built = build_course(ana)
    course_id = built["course"]["id"]
    second = data(call(ana, "forge_add_module", course_id=course_id, title="Procedure"))
    assert second["order"] == 1
    reordered = data(
        call(
            ana,
            "forge_reorder_modules",
            course_id=course_id,
            module_ids=[second["id"], built["module"]["id"]],
        )
    )
    assert [m["title"] for m in reordered["modules"]] == ["Procedure", "Energy sources"]
    assert "exactly once" in error(
        call(ana, "forge_reorder_modules", course_id=course_id, module_ids=[second["id"]])
    )


def test_no_status_changes_and_no_removal_from_published_courses(ana):
    built = build_course(ana)
    assert error(
        call(ana, "forge_update_course", course_id=built["course"]["id"], status="published")
    )
    assert Course.objects.get(pk=built["course"]["id"]).status == "draft"
    Course.objects.filter(pk=built["course"]["id"]).update(status="published")
    assert "unpublish it in the admin app" in error(
        call(ana, "forge_remove_lesson", lesson_id=built["lesson"]["id"])
    )
    assert "unpublish it in the admin app" in error(
        call(ana, "forge_remove_module", module_id=built["module"]["id"])
    )
    assert Lesson.objects.filter(pk=built["lesson"]["id"]).exists()


def test_removing_from_a_draft_renumbers(ana):
    built = build_course(ana)
    module_id = built["module"]["id"]
    second = data(
        call(ana, "forge_add_lesson", module_id=module_id, title="Second", content_type="video")
    )
    assert second["order"] == 1
    data(call(ana, "forge_remove_lesson", lesson_id=built["lesson"]["id"]))
    course = data(call(ana, "forge_get_course", course_id=built["course"]["id"]))
    assert [(x["id"], x["order"]) for x in course["modules"][0]["lessons"]] == [(second["id"], 0)]


def test_other_tenants_courses_are_invisible(ana, acme):
    built = build_course(ana)
    wile = oauth_token(make_member(acme, "wile", Role.TENANT_ADMIN), acme)
    assert data(call(wile, "forge_list_courses")) == {"courses": []}
    assert "No course" in error(call(wile, "forge_get_course", course_id=built["course"]["id"]))
    assert "No lesson" in error(
        call(wile, "forge_update_lesson", lesson_id=built["lesson"]["id"], title="pwned")
    )
    assert "No module" in error(
        call(
            wile,
            "forge_add_lesson",
            module_id=built["module"]["id"],
            title="x",
            content_type="video",
        )
    )
    assert Lesson.objects.get(pk=built["lesson"]["id"]).title == "Why LOTO matters"


def test_ids_that_arent_ids_are_a_plain_error(ana):
    assert "No course" in error(call(ana, "forge_get_course", course_id="not-a-uuid"))


def test_urls_must_be_https(ana):
    built = build_course(ana)
    assert "https" in error(
        call(
            ana,
            "forge_update_lesson",
            lesson_id=built["lesson"]["id"],
            external_url="http://example.com/v.mp4",
        )
    )


def test_a_lesson_can_only_point_at_this_tenants_assets_games_and_quizzes(ana, acme):
    from apps.assessments.models import Quiz
    from apps.assets.models import Asset
    from apps.games.models import Game

    built = build_course(ana)
    lesson_id = built["lesson"]["id"]
    theirs = Asset.objects.create(
        tenant=acme, key="assets/acme/x", filename="x.mp4", content_type="video/mp4", size=1
    )
    assert "No asset" in error(
        call(ana, "forge_update_lesson", lesson_id=lesson_id, asset_ref=theirs.ref)
    )
    game = Game.objects.create(tenant=acme, title="Theirs")
    assert "No game" in error(
        call(
            ana,
            "forge_update_lesson",
            lesson_id=lesson_id,
            content_type="game",
            asset_ref=str(game.pk),
        )
    )
    quiz = Quiz.objects.create(tenant=acme, title="Theirs")
    assert "No quiz" in error(
        call(ana, "forge_update_lesson", lesson_id=lesson_id, quiz_id=str(quiz.pk))
    )
