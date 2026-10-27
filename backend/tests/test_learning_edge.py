"""Edge cases for the learning and assessments apps: odd content, odd input, odd order."""

import pytest

from apps.accounts.models import Role
from apps.assessments.models import Quiz, QuizAttempt
from apps.learning.models import Course, Enrollment, Lesson, LessonProgress, Module
from conftest import client_for, make_member, sign_in
from tests.content import FAILING, PASSING, build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "admin": make_member(lakewood, "admin", Role.TENANT_ADMIN),
        "learner": make_member(lakewood, "learner"),
    }


@pytest.fixture
def content(lakewood, people):
    return build_course(lakewood, people["teacher"])


def as_(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


def enroll(uid, course):
    return as_(uid).post(f"/api/courses/{course.pk}/enroll")


# --- Content that is empty or changes under a learner -------------------------


def test_a_course_with_no_lessons_cannot_be_finished_or_crash(lakewood, people):
    course = Course.objects.create(tenant=lakewood, title="Empty", status="published")
    assert enroll("learner", course).status_code == 201
    outline = as_("learner").get(f"/api/courses/{course.pk}").json()
    assert outline["modules"] == []
    assert outline["enrollment"]["progressPct"] == 0
    (mine,) = as_("learner").get("/api/enrollments/me").json()
    assert mine["nextLesson"] is None


def test_adding_a_lesson_after_completion_does_not_unfinish_the_course(content):
    enroll("learner", content.course)
    as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    for lesson in (content.checked, content.exam):
        Lesson.objects.filter(pk=lesson.pk).update(content_type="video", quiz=None)
    as_("learner").post(f"/api/lessons/{content.checked.pk}/complete")
    done = as_("learner").post(f"/api/lessons/{content.exam.pk}/complete").json()
    assert done["completed"] is True
    Lesson.objects.create(
        tenant=content.course.tenant, module=content.module, title="Late", content_type="video"
    )
    enrollment = Enrollment.objects.get()
    assert enrollment.completed_at is not None  # stays finished
    assert enrollment.progress_pct == 100


def test_changing_the_quiz_after_answers_keeps_the_lesson_consistent(content):
    enroll("learner", content.course)
    as_("learner").post(
        f"/api/lessons/{content.checked.pk}/check",
        {"questionId": "q1", "selectedOptionIds": ["a"]},
        format="json",
    )
    # An author swaps the questions; the old answer's question no longer exists.
    Quiz.objects.filter(pk=content.check.pk).update(questions=content.graded.questions)
    stale = as_("learner").post(
        f"/api/lessons/{content.checked.pk}/check",
        {"questionId": "q2", "selectedOptionIds": ["f"]},
        format="json",
    )
    assert stale.status_code == 400  # q2 is gone: a clear error, not a 500
    data = as_("learner").get(f"/api/lessons/{content.checked.pk}")
    assert data.status_code == 200


def test_a_check_quiz_with_no_questions_cannot_be_answered_or_crash(content):
    Quiz.objects.filter(pk=content.check.pk).update(questions=[])
    enroll("learner", content.course)
    response = as_("learner").post(
        f"/api/lessons/{content.checked.pk}/check",
        {"questionId": "q1", "selectedOptionIds": ["a"]},
        format="json",
    )
    assert response.status_code == 400


# --- Input shapes -------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"questionId": ""},
        {"questionId": "q1", "selectedOptionIds": "a"},
        {"questionId": "q1", "order": "x"},
        {"questionId": "q1", "selectedOptionIds": ["a"] * 500},
    ],
)
def test_malformed_check_answers_are_400_not_500(content, body):
    enroll("learner", content.course)
    response = as_("learner").post(f"/api/lessons/{content.checked.pk}/check", body, format="json")
    assert response.status_code == 400


@pytest.mark.parametrize("responses", [None, "x", [None], [{}]])
def test_malformed_attempts_are_400_and_do_not_use_an_attempt(content, responses):
    enroll("learner", content.course)
    response = as_("learner").post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": responses}, format="json"
    )
    assert response.status_code == 400
    assert not QuizAttempt.objects.exists()


def test_an_empty_attempt_is_a_graded_zero_not_an_error(content):
    enroll("learner", content.course)
    result = as_("learner").post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": []}, format="json"
    )
    assert result.status_code == 200
    assert result.json()["scorePct"] == 0


def test_answers_to_unknown_questions_are_ignored_in_an_attempt(content):
    enroll("learner", content.course)
    result = as_("learner").post(
        f"/api/lessons/{content.exam.pk}/attempts",
        {"responses": [*PASSING, {"questionId": "ghost", "selectedOptionIds": ["x"]}]},
        format="json",
    )
    assert result.json()["passed"] is True


def test_runtime_state_has_a_size_limit(content):
    enroll("learner", content.course)
    big = {"cmi.suspend_data": "x" * 70_000}
    response = as_("learner").put(
        f"/api/lessons/{content.video.pk}/runtime", {"cmi": big}, format="json"
    )
    assert response.status_code == 400


def test_runtime_must_be_an_object(content):
    enroll("learner", content.course)
    response = as_("learner").put(
        f"/api/lessons/{content.video.pk}/runtime", {"cmi": ["a"]}, format="json"
    )
    assert response.status_code == 400


def test_score_must_be_between_0_and_100(content):
    enroll("learner", content.course)
    for score in (-1, 101, "a"):
        response = as_("learner").post(
            f"/api/lessons/{content.video.pk}/complete", {"score": score}, format="json"
        )
        assert response.status_code == 400


# --- Authoring edges ----------------------------------------------------------


def test_lesson_limits_and_choices_are_enforced(content):
    teacher = as_("teacher")
    url = f"/api/modules/{content.module.pk}/lessons"
    too_many = [{"title": f"k{i}"} for i in range(21)]
    assert (
        teacher.post(
            url, {"title": "x", "contentType": "video", "keyPoints": too_many}, format="json"
        ).status_code
        == 400
    )
    assert (
        teacher.post(url, {"title": "x", "contentType": "podcast"}, format="json").status_code
        == 400
    )
    assert (
        teacher.post(url, {"title": "", "contentType": "video"}, format="json").status_code == 400
    )
    assert (
        teacher.post(
            url, {"title": "x", "contentType": "scorm", "scormVersion": "3"}, format="json"
        ).status_code
        == 400
    )


def test_patching_a_lesson_in_another_tenant_is_not_found(content, acme):
    make_member(acme, "outsider", Role.INSTRUCTOR)
    outsider = client_for(sign_in("outsider"), tenant="acme")
    assert (
        outsider.patch(
            f"/api/lessons/{content.video.pk}", {"title": "pwned"}, format="json"
        ).status_code
        == 404
    )
    content.video.refresh_from_db()
    assert content.video.title == "Why it works"


def test_a_module_cannot_be_attached_to_another_tenants_course(content, acme):
    make_member(acme, "outsider", Role.INSTRUCTOR)
    outsider = client_for(sign_in("outsider"), tenant="acme")
    response = outsider.post(
        f"/api/courses/{content.course.pk}/modules", {"title": "Planted"}, format="json"
    )
    assert response.status_code == 404
    assert not Module.objects.filter(title="Planted").exists()


def test_removing_a_lessons_quiz_unlinks_it(content):
    response = as_("teacher").patch(
        f"/api/lessons/{content.checked.pk}", {"quizId": None}, format="json"
    )
    assert response.status_code == 200
    content.checked.refresh_from_db()
    assert content.checked.quiz_id is None


def test_archived_courses_disappear_for_learners_but_not_staff(content):
    enroll("learner", content.course)
    as_("teacher").patch(f"/api/courses/{content.course.pk}", {"status": "archived"}, format="json")
    assert as_("learner").get(f"/api/courses/{content.course.pk}").status_code == 404
    assert as_("learner").post(f"/api/lessons/{content.video.pk}/complete").status_code == 404
    assert as_("learner").get("/api/enrollments/me").json() == []
    assert as_("teacher").get(f"/api/courses/{content.course.pk}").status_code == 200


def test_assigning_a_draft_course_is_refused(lakewood, people):
    draft = build_course(lakewood, people["teacher"], status="draft").course
    response = as_("teacher").post(
        f"/api/courses/{draft.pk}/assign", {"memberIds": [str(people["learner"].pk)]}, format="json"
    )
    assert response.status_code == 409


@pytest.mark.parametrize("body", [{}, {"memberIds": []}, {"memberIds": ["not-a-uuid"]}])
def test_bad_assignments_are_400(content, body):
    assert (
        as_("teacher")
        .post(f"/api/courses/{content.course.pk}/assign", body, format="json")
        .status_code
        == 400
    )


def test_duplicate_member_ids_in_one_assignment_enroll_once(content, people):
    member = str(people["learner"].pk)
    response = as_("teacher").post(
        f"/api/courses/{content.course.pk}/assign", {"memberIds": [member, member]}, format="json"
    )
    assert response.json() == {"assigned": 1, "skipped": 0}


def test_a_superadmin_without_a_tenant_gets_a_clear_403(content):
    from apps.accounts.models import Member

    Member.objects.create(tenant=None, firebase_uid="root", email="r@x.io", role=Role.SUPERADMIN)
    client = client_for(sign_in("root"))
    assert client.get("/api/courses").status_code == 403
    acting = client_for(sign_in("root"), tenant="lakewood")
    assert acting.get("/api/courses").status_code == 200


# --- Exactly-once under replay -------------------------------------------------


def test_replayed_completion_never_double_counts(content):
    enroll("learner", content.course)
    for _ in range(5):
        as_("learner").post(f"/api/lessons/{content.video.pk}/complete")
    assert LessonProgress.objects.filter(completed_at__isnull=False).count() == 1
    assert Enrollment.objects.get().progress_pct == 33


def test_failed_attempts_before_a_pass_still_count_against_the_limit(content):
    enroll("learner", content.course)
    url = f"/api/lessons/{content.exam.pk}/attempts"
    as_("learner").post(url, {"responses": FAILING}, format="json")
    last = as_("learner").post(url, {"responses": PASSING}, format="json").json()
    assert (last["attemptsUsed"], last["attemptsRemaining"]) == (2, 0)
    assert as_("learner").post(url, {"responses": PASSING}, format="json").status_code == 409


def test_unlimited_attempts_report_null_remaining(content):
    Quiz.objects.filter(pk=content.graded.pk).update(max_attempts=None)
    enroll("learner", content.course)
    result = as_("learner").post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": FAILING}, format="json"
    )
    assert result.json()["attemptsRemaining"] is None
