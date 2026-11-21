"""Knowledge checks and graded quizzes. The `submitQuiz` cases port
apps/functions/src/quizzes/submit-quiz.spec.ts."""

import pytest

from apps.accounts.models import Role
from apps.assessments.authoring import answerable_errors
from apps.assessments.models import CheckAnswer, Quiz, QuizAttempt
from apps.audit.models import AuditEntry
from apps.learning.models import Enrollment, LessonProgress
from conftest import client_for, make_member, sign_in
from tests.content import FAILING, PASSING, build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "learner"),
    }


@pytest.fixture
def content(lakewood, people):
    return build_course(lakewood, people["teacher"])


def as_(uid):
    return client_for(sign_in(uid))


@pytest.fixture
def learner(content):
    client = as_("learner")
    client.post(f"/api/courses/{content.course.pk}/enroll")
    return client


def submit(client, lesson, responses, key=None):
    headers = {"Idempotency-Key": key} if key else None
    return client.post(
        f"/api/lessons/{lesson.pk}/attempts",
        {"responses": responses},
        format="json",
        headers=headers,
    )


def answer(client, lesson, question_id, **response):
    return client.post(
        f"/api/lessons/{lesson.pk}/check", {"questionId": question_id, **response}, format="json"
    )


# --- Quiz authoring ----------------------------------------------------------


def test_staff_create_quizzes_with_validated_questions(people):
    teacher = as_("teacher")
    bad = teacher.post(
        "/api/quizzes", {"title": "Bad", "questions": [{"id": "q", "type": "essay"}]}, format="json"
    )
    assert bad.status_code == 400
    good = teacher.post(
        "/api/quizzes",
        {
            "title": "Good",
            "passThreshold": 80,
            "questions": [
                {
                    "id": "q",
                    "type": "fill_in",
                    "prompt": "Capital of France?",
                    "answerKey": ["Paris"],
                }
            ],
        },
        format="json",
    )
    assert good.status_code == 201, good.json()
    assert good.json()["questions"][0]["points"] == 1  # default applied


def test_learners_cannot_read_quizzes_with_answer_keys(content):
    learner = as_("learner")
    assert learner.get("/api/quizzes").status_code == 403
    assert learner.get(f"/api/quizzes/{content.graded.pk}").status_code == 403


# --- submitQuiz port ---------------------------------------------------------


def test_rejects_unauthenticated_callers(content):
    assert submit(client_for(), content.exam, PASSING).status_code == 401


def test_rejects_another_tenant(content, acme):
    make_member(acme, "outsider")
    outsider = client_for(sign_in("outsider"), tenant="acme")
    assert submit(outsider, content.exam, PASSING).status_code == 404


def test_rejects_a_malformed_quiz(content, learner):
    Quiz.objects.filter(pk=content.graded.pk).update(questions=[{"id": "g1"}])
    assert submit(learner, content.exam, PASSING).status_code == 409
    assert not QuizAttempt.objects.exists()


def test_grades_a_pass_and_records_score_and_completion_once(content, learner):
    result = submit(learner, content.exam, PASSING).json()
    assert result["passed"] is True
    assert result["scorePct"] == 100
    assert (result["attemptsUsed"], result["attemptsRemaining"]) == (1, 1)
    assert result["completion"]["firstCompletion"] is True
    progress = LessonProgress.objects.get(lesson=content.exam)
    assert progress.score == 100
    assert AuditEntry.objects.filter(action="assessments.quiz.graded").count() == 1

    again = submit(learner, content.exam, PASSING).json()
    assert again["completion"]["firstCompletion"] is False
    assert AuditEntry.objects.filter(action="learning.lesson.completed").count() == 1


def test_a_failing_submission_does_not_complete(content, learner):
    result = submit(learner, content.exam, FAILING).json()
    assert (result["passed"], result["scorePct"], result["completion"]) == (False, 0, None)
    assert not LessonProgress.objects.filter(completed_at__isnull=False).exists()


def test_enforces_max_attempts(content, learner):
    submit(learner, content.exam, FAILING)
    submit(learner, content.exam, FAILING)
    third = submit(learner, content.exam, PASSING)
    assert third.status_code == 409
    assert third.json() == {"detail": "No quiz attempts remaining."}
    assert QuizAttempt.objects.count() == 2


def test_a_replayed_attempt_returns_the_original_and_spends_nothing(content, learner):
    first = submit(learner, content.exam, FAILING, key="outbox-0001").json()
    replay = submit(learner, content.exam, FAILING, key="outbox-0001")
    assert replay.status_code == 200
    assert replay.json() == first
    assert QuizAttempt.objects.count() == 1
    assert AuditEntry.objects.filter(action="assessments.quiz.graded").count() == 1
    # The learner still has their second attempt.
    assert submit(learner, content.exam, PASSING, key="outbox-0002").json()["passed"] is True


def test_a_replayed_pass_does_not_pay_twice(content, learner):
    first = submit(learner, content.exam, PASSING, key="outbox-pass").json()
    assert first["completion"]["firstCompletion"] is True
    replay = submit(learner, content.exam, PASSING, key="outbox-pass").json()
    assert replay["attemptsUsed"] == 1
    assert replay["completion"] == {
        "progressPct": first["completion"]["progressPct"],
        "completed": first["completion"]["completed"],
        "firstCompletion": False,
        "award": None,
    }
    assert AuditEntry.objects.filter(action="learning.lesson.completed").count() == 1


def test_an_idempotency_key_cannot_be_reused_for_other_answers(content, learner):
    submit(learner, content.exam, FAILING, key="outbox-0003")
    reused = submit(learner, content.exam, PASSING, key="outbox-0003")
    assert reused.status_code == 409
    assert QuizAttempt.objects.count() == 1


def test_a_malformed_idempotency_key_is_rejected(content, learner):
    assert submit(learner, content.exam, PASSING, key="bad key!").status_code == 400
    assert QuizAttempt.objects.count() == 0


def test_the_client_cannot_send_its_own_score(content, learner):
    response = learner.post(
        f"/api/lessons/{content.exam.pk}/attempts",
        {"responses": FAILING, "scorePct": 100, "passed": True},
        format="json",
    )
    assert response.json()["passed"] is False


def test_attempts_need_an_enrollment(content):
    assert submit(as_("learner"), content.exam, PASSING).status_code == 403


def test_knowledge_check_lessons_take_no_whole_submissions(content, learner):
    assert submit(learner, content.checked, PASSING).status_code == 409


# --- Knowledge checks (first try) --------------------------------------------


def test_first_try_is_kept_and_retries_can_still_solve(content, learner):
    wrong = answer(learner, content.checked, "q1", selectedOptionIds=["b"]).json()
    assert wrong == {
        "questionId": "q1",
        "correct": False,
        "firstTry": True,
        "solved": False,
        "feedback": "Look at who wrote the text.",
        "completion": None,
    }
    right = answer(learner, content.checked, "q1", selectedOptionIds=["a"]).json()
    assert (right["correct"], right["firstTry"], right["solved"]) == (True, False, True)

    row = CheckAnswer.objects.get(question_id="q1")
    assert row.first_correct is False
    assert row.first_response == {"questionId": "q1", "selectedOptionIds": ["b"]}
    assert row.attempts == 2


def test_solving_every_question_completes_with_the_first_try_score(content, learner):
    answer(learner, content.checked, "q1", selectedOptionIds=["b"])  # wrong first
    answer(learner, content.checked, "q1", selectedOptionIds=["a"])
    done = answer(learner, content.checked, "q2", selectedOptionIds=["f"]).json()
    assert done["completion"] == {
        "progressPct": 33,
        "completed": False,
        "firstCompletion": True,
        # 20 for the lesson + 10 for the one question answered right on the first try
        "award": {
            "awarded": 30,
            "totalXp": 30,
            "level": 1,
            "leveledUp": False,
            "streakDays": 1,
            "streakExtended": True,
            "badges": [],
        },
    }
    # One of two questions right on the first try.
    assert LessonProgress.objects.get(lesson=content.checked).score == 50


def test_lesson_detail_reports_answered_questions(content, learner):
    answer(learner, content.checked, "q1", selectedOptionIds=["a"])
    quiz = learner.get(f"/api/lessons/{content.checked.pk}").json()["quiz"]
    assert quiz["answered"] == {"q1": {"firstCorrect": True, "solved": True}}


def test_unknown_question_is_rejected(content, learner):
    assert answer(learner, content.checked, "nope", selectedOptionIds=["a"]).status_code == 400


def test_finishing_every_lesson_completes_the_course(content, learner):
    learner.post(f"/api/lessons/{content.video.pk}/complete")
    answer(learner, content.checked, "q1", selectedOptionIds=["a"])
    answer(learner, content.checked, "q2", selectedOptionIds=["f"])
    result = submit(learner, content.exam, PASSING).json()
    assert result["completion"]["progressPct"] == 100
    assert result["completion"]["completed"] is True
    assert result["completion"]["firstCompletion"] is True
    # video 20 + checked lesson (20 + 2 first-try points x 10) + exam (20 + 1 point x 10)
    assert result["completion"]["award"]["awarded"] == 30
    assert result["completion"]["award"]["totalXp"] == 90
    assert Enrollment.objects.get().completed_at is not None
    assert AuditEntry.objects.filter(action="learning.course.completed").count() == 1


# --- Ordering and matching ---------------------------------------------------

ORDERING = {
    "id": "ord",
    "type": "ordering",
    "prompt": "Put the lockout steps in order.",
    "points": 1,
    "options": [
        {"id": "s1", "text": "Notify affected staff"},
        {"id": "s2", "text": "Shut the machine down"},
        {"id": "s3", "text": "Isolate energy sources"},
        {"id": "s4", "text": "Apply locks and tags"},
    ],
    "answerKey": ["s1", "s2", "s3", "s4"],
}
MATCHING = {
    "id": "mat",
    "type": "matching",
    "prompt": "Match each hazard to its energy type.",
    "points": 1,
    "options": [],
    "answerKey": ["Spring:Mechanical", "Battery:Electrical", "Steam line:Thermal"],
}


@pytest.fixture
def mixed(content, learner):
    content.graded.questions = [ORDERING, MATCHING]
    content.graded.save()
    return content


def test_learners_see_shuffled_ordering_items_and_both_matching_columns(mixed, learner):
    quiz = learner.get(f"/api/lessons/{mixed.exam.pk}").json()["quiz"]
    ordering, matching = quiz["questions"]
    shown = [o["id"] for o in ordering["options"]]
    assert sorted(shown) == ["s1", "s2", "s3", "s4"]
    assert shown != ORDERING["answerKey"]
    # Stable across loads, so an arrangement in progress survives a reload.
    again = learner.get(f"/api/lessons/{mixed.exam.pk}").json()["quiz"]["questions"][0]
    assert [o["id"] for o in again["options"]] == shown
    assert matching["matching"]["left"] == ["Spring", "Battery", "Steam line"]
    assert sorted(matching["matching"]["right"]) == ["Electrical", "Mechanical", "Thermal"]
    assert "answerKey" not in str(quiz)


def test_ordering_and_matching_are_graded(mixed, learner):
    right = [
        {"questionId": "ord", "order": ["s1", "s2", "s3", "s4"]},
        {"questionId": "mat", "selectedOptionIds": MATCHING["answerKey"][::-1]},
    ]
    wrong = [
        {"questionId": "ord", "order": ["s2", "s1", "s3", "s4"]},
        {
            "questionId": "mat",
            "selectedOptionIds": ["Spring:Electrical", "Battery:Mechanical", "Steam line:Thermal"],
        },
    ]
    failed = submit(learner, mixed.exam, wrong).json()
    assert failed["earnedPoints"] == 0
    assert submit(learner, mixed.exam, right).json()["passed"] is True


@pytest.mark.parametrize(
    ("key", "message"),
    [
        (["Spring:Mechanical"], "2 or more"),
        (["Spring:Mechanical", "Battery:"], "2 or more"),
        (["Spring:Mechanical", "Spring:Thermal"], "only one pair"),
    ],
)
def test_matching_questions_must_be_answerable(key, message):
    (error,) = answerable_errors([{**MATCHING, "answerKey": key}])
    assert message in error
    assert answerable_errors([MATCHING]) == []
