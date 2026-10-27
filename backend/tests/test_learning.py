import pytest
from django.db import transaction

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.learning.models import Course, Enrollment, LessonProgress
from apps.tenants import rls
from conftest import client_for, make_member, sign_in
from tests.content import build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "learner"),
        "peer": make_member(lakewood, "peer"),
    }


@pytest.fixture
def content(lakewood, people):
    return build_course(lakewood, people["teacher"])


def as_(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


def enroll(uid, course):
    return as_(uid).post(f"/api/courses/{course.pk}/enroll")


# --- Authoring ---------------------------------------------------------------


def test_instructor_builds_a_course_module_and_lesson(people):
    teacher = as_("teacher")
    course = teacher.post("/api/courses", {"title": "Secure I", "tags": ["ai"]}, format="json")
    assert course.status_code == 201
    assert course.json()["status"] == "draft"
    course_id = course.json()["id"]

    module = teacher.post(
        f"/api/courses/{course_id}/modules", {"title": "Module 1", "label": "Week 1"}, format="json"
    )
    assert module.status_code == 201
    lesson = teacher.post(
        f"/api/modules/{module.json()['id']}/lessons",
        {
            "title": "Intro",
            "contentType": "video",
            "externalUrl": "https://videos.example.com/intro.mp4",
            "estimatedMinutes": 6,
            "frameworkTags": ["OWASP LLM01:2025"],
            "keyPoints": [{"title": "One", "body": "First point"}],
        },
        format="json",
    )
    assert lesson.status_code == 201, lesson.json()
    assert lesson.json()["keyPoints"] == [{"title": "One", "body": "First point"}]
    assert AuditEntry.objects.filter(action="learning.course.created").count() == 1


def test_learners_cannot_author(content):
    learner = as_("learner")
    assert learner.post("/api/courses", {"title": "Mine"}, format="json").status_code == 403
    assert (
        learner.patch(
            f"/api/courses/{content.course.pk}", {"title": "X"}, format="json"
        ).status_code
        == 403
    )
    assert (
        learner.post(
            f"/api/modules/{content.module.pk}/lessons",
            {"title": "X", "contentType": "video"},
            format="json",
        ).status_code
        == 403
    )


def test_publishing_is_audited(lakewood, people):
    course = build_course(lakewood, people["teacher"], status="draft").course
    response = as_("teacher").patch(
        f"/api/courses/{course.pk}", {"status": "published"}, format="json"
    )
    assert response.status_code == 200
    entry = AuditEntry.objects.get(action="learning.course.status")
    assert entry.details == {"old": "draft", "new": "published"}


def test_lesson_can_only_use_a_quiz_from_its_own_tenant(content, acme):
    foreign = build_course(acme, make_member(acme, "acme-teacher", Role.INSTRUCTOR)).check
    response = as_("teacher").patch(
        f"/api/lessons/{content.video.pk}", {"quizId": str(foreign.pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.json() == {"quizId": ["No such quiz."]}


# --- Visibility --------------------------------------------------------------


def test_learners_see_published_courses_only(lakewood, people, content):
    draft = build_course(lakewood, people["teacher"], status="draft").course
    learner_ids = [c["id"] for c in as_("learner").get("/api/courses").json()]
    teacher_ids = [c["id"] for c in as_("teacher").get("/api/courses").json()]
    assert learner_ids == [str(content.course.pk)]
    assert set(teacher_ids) == {str(content.course.pk), str(draft.pk)}
    assert as_("learner").get(f"/api/courses/{draft.pk}").status_code == 404


def test_courses_are_tenant_scoped(content, acme):
    make_member(acme, "outsider")
    outsider = client_for(sign_in("outsider"), tenant="acme")
    assert outsider.get("/api/courses").json() == []
    assert outsider.get(f"/api/courses/{content.course.pk}").status_code == 404
    assert outsider.get(f"/api/lessons/{content.video.pk}").status_code == 404


def test_outline_lists_modules_lessons_and_my_progress(content):
    enroll("learner", content.course)
    as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    data = as_("learner").get(f"/api/courses/{content.course.pk}").json()
    (module,) = data["modules"]
    assert module["label"] == "Week 5"
    assert [(lsn["title"], lsn["completed"]) for lsn in module["lessons"]] == [
        ("Why it works", True),
        ("How prompt injection hijacks an AI assistant", False),
        ("Finding report", False),
    ]
    assert module["lessons"][1]["frameworkTags"] == ["OWASP LLM01:2025"]
    assert data["enrollment"]["progressPct"] == 33


def test_lesson_detail_never_exposes_answers(content):
    data = as_("learner").get(f"/api/lessons/{content.checked.pk}").json()
    assert data["keyPoints"][0]["title"] == "Data vs. instructions"
    assert data["quiz"]["mode"] == "check"
    flat = str(data["quiz"])
    assert "isCorrect" not in flat and "answerKey" not in flat and "feedback" not in flat


# --- Enrollment --------------------------------------------------------------


def test_self_enrollment_is_idempotent(content):
    assert enroll("learner", content.course).status_code == 201
    as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    again = enroll("learner", content.course)
    assert again.status_code == 200
    assert again.json()["progressPct"] == 33  # never reset


def test_cannot_enroll_in_a_draft(lakewood, people):
    draft = build_course(lakewood, people["teacher"], status="draft").course
    # Staff can see drafts but nobody enrolls in one.
    assert enroll("teacher", draft).status_code == 409


def test_staff_assign_keeps_existing_progress(content, people):
    enroll("learner", content.course)
    as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    response = as_("teacher").post(
        f"/api/courses/{content.course.pk}/assign",
        {"memberIds": [str(people["learner"].pk), str(people["peer"].pk)]},
        format="json",
    )
    assert response.json() == {"assigned": 1, "skipped": 1}
    assert Enrollment.objects.get(member=people["learner"]).progress_pct == 33
    assert Enrollment.objects.get(member=people["peer"]).assigned_by == people["teacher"]
    assert AuditEntry.objects.get(action="learning.course.assigned").details == {
        "assigned": 1,
        "skipped": 1,
    }


def test_assign_rejects_members_of_other_tenants(content, acme):
    outsider = make_member(acme, "outsider")
    response = as_("teacher").post(
        f"/api/courses/{content.course.pk}/assign",
        {"memberIds": [str(outsider.pk)]},
        format="json",
    )
    assert response.status_code == 400
    assert not Enrollment.objects.exists()


def test_learners_cannot_assign(content, people):
    response = as_("learner").post(
        f"/api/courses/{content.course.pk}/assign",
        {"memberIds": [str(people["peer"].pk)]},
        format="json",
    )
    assert response.status_code == 403


def test_my_enrollments_show_the_next_lesson(content):
    enroll("learner", content.course)
    as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    (mine,) = as_("learner").get("/api/enrollments/me").json()
    assert mine["course"]["title"] == "AI Cyber Defender"
    assert mine["nextLesson"]["title"] == "How prompt injection hijacks an AI assistant"
    assert mine["nextLesson"]["moduleLabel"] == "Week 5"


# --- Completion --------------------------------------------------------------


def test_completion_needs_an_enrollment(content):
    assert as_("learner").post(f"/api/lessons/{content.video.pk}/complete").status_code == 403


def test_completion_is_recorded_once(content):
    enroll("learner", content.course)
    first = as_("learner").post(f"/api/lessons/{content.video.pk}/complete").json()
    replay = as_("learner").post(f"/api/lessons/{content.video.pk}/complete").json()
    assert first == {"progressPct": 33, "completed": False, "firstCompletion": True}
    assert replay == {"progressPct": 33, "completed": False, "firstCompletion": False}
    assert AuditEntry.objects.filter(action="learning.lesson.completed").count() == 1


def test_lessons_with_a_quiz_cannot_be_completed_directly(content):
    enroll("learner", content.course)
    for lesson in (content.checked, content.exam):
        assert as_("learner").post(f"/api/lessons/{lesson.pk}/complete").status_code == 409
    assert not LessonProgress.objects.filter(completed_at__isnull=False).exists()


def test_runtime_state_is_saved_and_returned(content):
    enroll("learner", content.course)
    cmi = {"cmi.location": "page-4", "cmi.suspend_data": "abc"}
    put = as_("learner").put(
        f"/api/lessons/{content.video.pk}/runtime", {"cmi": cmi}, format="json"
    )
    assert put.status_code == 204
    data = as_("learner").get(f"/api/lessons/{content.video.pk}").json()
    assert data["progress"]["runtime"] == cmi
    assert data["progress"]["completedAt"] is None


# --- Row-level security ------------------------------------------------------


def test_rls_hides_other_tenants_courses(content, acme):
    build_course(acme, make_member(acme, "acme-teacher", Role.INSTRUCTOR))
    rls.set_bypass(False)
    rls.set_tenant("lakewood")
    assert list(Course.objects.values_list("tenant_id", flat=True)) == ["lakewood"]
    with pytest.raises(Exception), transaction.atomic():  # noqa: B017 (psycopg error type varies)
        Course.objects.create(tenant=acme, title="Planted")
