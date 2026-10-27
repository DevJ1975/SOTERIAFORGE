"""Quizzes, per-question knowledge-check answers and graded quiz attempts.

Questions are stored as JSON in the shape of `quizQuestion` in
libs/shared/src/lib/schemas/quiz.ts and validated before every save and before
grading (`grading.parse_questions`), so a malformed quiz is never graded.
"""

import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Quiz(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    title = models.CharField(max_length=300)
    questions = models.JSONField(default=list, blank=True)
    pass_threshold = models.PositiveSmallIntegerField(
        default=70, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    max_attempts = models.PositiveSmallIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]
        verbose_name_plural = "quizzes"

    def __str__(self) -> str:
        return self.title


class CheckAnswer(models.Model):
    """A learner's answers to one knowledge-check question.

    The first answer is kept as given (`first_*`, server-timestamped) and never
    changes; it feeds the score card and the Engage debrief heat map. Later
    answers only count `attempts` and set `solved_at` once one is correct.
    """

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    enrollment = models.ForeignKey(
        "learning.Enrollment", on_delete=models.PROTECT, related_name="+"
    )
    lesson = models.ForeignKey("learning.Lesson", on_delete=models.PROTECT, related_name="+")
    quiz = models.ForeignKey(Quiz, on_delete=models.PROTECT, related_name="+")
    question_id = models.CharField(max_length=100)
    first_response = models.JSONField()
    first_correct = models.BooleanField()
    first_answered_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=1)
    solved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["enrollment", "lesson", "question_id"], name="check_answer_unique"
            )
        ]

    def __str__(self) -> str:
        return f"{self.enrollment_id} {self.lesson_id} {self.question_id}"


class QuizAttempt(models.Model):
    """One graded submission of a whole quiz (port of the `submitQuiz` function)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    enrollment = models.ForeignKey(
        "learning.Enrollment", on_delete=models.PROTECT, related_name="+"
    )
    lesson = models.ForeignKey("learning.Lesson", on_delete=models.PROTECT, related_name="+")
    quiz = models.ForeignKey(Quiz, on_delete=models.PROTECT, related_name="+")
    number = models.PositiveIntegerField()
    responses = models.JSONField()
    earned_points = models.PositiveIntegerField()
    total_points = models.PositiveIntegerField()
    score_pct = models.PositiveSmallIntegerField()
    passed = models.BooleanField()
    per_question = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["enrollment", "quiz", "number"], name="quiz_attempt_number_unique"
            )
        ]

    def __str__(self) -> str:
        return f"{self.quiz_id} #{self.number}: {self.score_pct}%"
