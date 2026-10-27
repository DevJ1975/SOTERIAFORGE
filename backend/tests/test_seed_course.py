import pytest
from django.core.management import CommandError, call_command

from apps.assessments.grading import grade, parse_questions
from apps.assessments.models import Quiz
from apps.learning.models import Course, Lesson, Module

pytestmark = pytest.mark.django_db


def seed(tenant, *args):
    call_command("seed_course", "--tenant", tenant.pk, *args)


def test_creates_course_module_and_lessons(lakewood):
    seed(lakewood)
    course = Course.objects.get(tenant=lakewood, title="AI Cyber Defender")
    assert course.status == "draft"
    module = course.modules.get()
    assert module.label == "Week 5 · Secure I"
    lessons = list(module.lessons.all())
    assert [le.order for le in lessons] == [1, 2, 3]
    assert lessons[0].content_type == "video"
    explainer = lessons[1]
    assert explainer.title == "How prompt injection hijacks an AI assistant"
    assert explainer.framework_tags == ["OWASP LLM01:2025"]
    assert len(explainer.key_points) == 3
    assert len(explainer.quiz.questions) == 3
    graded = lessons[2]
    assert graded.content_type == "quiz"
    assert (graded.quiz.pass_threshold, graded.quiz.max_attempts) == (70, 3)


def test_publish_flag(lakewood):
    seed(lakewood, "--publish")
    assert Course.objects.get(tenant=lakewood).status == "published"


def test_is_idempotent_and_keeps_publish_state(lakewood):
    seed(lakewood, "--publish")
    ids = set(Lesson.objects.values_list("id", flat=True))
    Lesson.objects.filter(order=1).update(title="Why AI assistants are attackable")
    Module.objects.update(label="stale")
    seed(lakewood)
    assert Course.objects.count() == 1
    assert Module.objects.count() == 1
    assert Quiz.objects.count() == 2
    assert set(Lesson.objects.values_list("id", flat=True)) == ids
    assert Module.objects.get().label == "Week 5 · Secure I"
    assert Course.objects.get().status == "published"


def test_scoped_to_the_tenant(lakewood, acme):
    seed(lakewood)
    seed(acme)
    assert Course.objects.filter(tenant=lakewood).count() == 1
    assert Course.objects.filter(tenant=acme).count() == 1
    assert Lesson.objects.exclude(tenant=lakewood).exclude(tenant=acme).count() == 0
    assert not Lesson.objects.filter(tenant=acme, module__course__tenant=lakewood).exists()
    assert set(Quiz.objects.filter(tenant=acme).values_list("id", flat=True)).isdisjoint(
        Quiz.objects.filter(tenant=lakewood).values_list("id", flat=True)
    )


def test_unknown_tenant_fails(db):
    with pytest.raises(CommandError):
        call_command("seed_course", "--tenant", "nope")


def test_graded_quiz_is_gradable(lakewood):
    seed(lakewood)
    quiz = Lesson.objects.get(tenant=lakewood, content_type="quiz").quiz
    questions = parse_questions(quiz.questions)
    perfect = [
        {
            "questionId": q["id"],
            "selectedOptionIds": [o["id"] for o in q["options"] if o.get("isCorrect")],
        }
        for q in questions
    ]
    assert grade(questions, perfect, quiz.pass_threshold).passed
    wrong = [{"questionId": q["id"], "selectedOptionIds": ["zzz"]} for q in questions]
    result = grade(questions, wrong, quiz.pass_threshold)
    assert not result.passed and result.score_pct == 0


def test_knowledge_check_is_valid(lakewood):
    seed(lakewood)
    lesson = Lesson.objects.get(tenant=lakewood, title__startswith="How prompt")
    questions = parse_questions(lesson.quiz.questions)
    assert {q["type"] for q in questions} <= {"mcq", "true_false"}
    for q in questions:
        assert sum(1 for o in q["options"] if o.get("isCorrect")) == 1
