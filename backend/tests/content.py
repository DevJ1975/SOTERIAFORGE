"""Course content shared by the learning and assessments tests."""

from types import SimpleNamespace

from apps.assessments.models import Quiz
from apps.learning.models import Course, Lesson, Module

CHECK_QUESTIONS = [
    {
        "id": "q1",
        "type": "mcq",
        "prompt": "An attacker plants instructions in a ticket. Which risk is this?",
        "points": 1,
        "options": [
            {"id": "a", "text": "Indirect prompt injection", "isCorrect": True},
            {"id": "b", "text": "Data poisoning"},
        ],
        "answerKey": [],
        "feedback": {"correct": "Right.", "incorrect": "Look at who wrote the text."},
    },
    {
        "id": "q2",
        "type": "true_false",
        "prompt": "The model can tell data from instructions.",
        "points": 1,
        "options": [{"id": "t", "text": "True"}, {"id": "f", "text": "False", "isCorrect": True}],
        "answerKey": [],
    },
]

GRADED_QUESTIONS = [
    {
        "id": "g1",
        "type": "mcq",
        "prompt": "Least privilege means?",
        "points": 1,
        "options": [
            {"id": "o1", "text": "Fewest rights", "isCorrect": True},
            {"id": "o2", "text": "All rights"},
        ],
        "answerKey": [],
    }
]
PASSING = [{"questionId": "g1", "selectedOptionIds": ["o1"]}]
FAILING = [{"questionId": "g1", "selectedOptionIds": ["o2"]}]


def build_course(tenant, author, *, status="published", max_attempts=2):
    course = Course.objects.create(
        tenant=tenant, title="AI Cyber Defender", status=status, created_by=author
    )
    module = Module.objects.create(
        tenant=tenant, course=course, title="Module 5.1 · Prompt Injection", label="Week 5", order=1
    )
    check = Quiz.objects.create(tenant=tenant, title="Check 5.1", questions=CHECK_QUESTIONS)
    graded = Quiz.objects.create(
        tenant=tenant,
        title="Knowledge check 5",
        questions=GRADED_QUESTIONS,
        pass_threshold=100,
        max_attempts=max_attempts,
    )
    video = Lesson.objects.create(
        tenant=tenant, module=module, title="Why it works", order=1, content_type="video"
    )
    checked = Lesson.objects.create(
        tenant=tenant,
        module=module,
        title="How prompt injection hijacks an AI assistant",
        order=2,
        content_type="video",
        framework_tags=["OWASP LLM01:2025"],
        key_points=[{"title": "Data vs. instructions", "body": "The model can't tell."}],
        quiz=check,
    )
    exam = Lesson.objects.create(
        tenant=tenant,
        module=module,
        title="Finding report",
        order=3,
        content_type="quiz",
        quiz=graded,
    )
    return SimpleNamespace(
        course=course,
        module=module,
        video=video,
        checked=checked,
        exam=exam,
        check=check,
        graded=graded,
    )
