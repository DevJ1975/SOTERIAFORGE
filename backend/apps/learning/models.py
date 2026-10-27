"""Courses → modules → lessons, and learner enrollments (platform plan Phase 2).

Every table carries `tenant` so the RLS policy applies to it directly. Content
(modules, lessons) is deleted with its course; learner records protect the
content they point at, so deleting a lesson someone completed fails instead of
silently dropping their history.
"""

import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Keep aligned with CONTENT_TYPES in libs/shared/src/lib/constants.ts.
CONTENT_TYPES = ["video", "scorm", "cmi5", "quiz", "game", "unity"]


class PublishStatus(models.TextChoices):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    title = models.CharField(max_length=300)
    description = models.TextField(max_length=5000, blank=True, default="")
    status = models.CharField(max_length=20, choices=PublishStatus, default=PublishStatus.DRAFT)
    tags = models.JSONField(default=list, blank=True)
    # Author opt-in (MO-07): learners may download cacheable content for offline use.
    available_offline = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]
        indexes = [models.Index(fields=["tenant", "status", "title"])]

    def __str__(self) -> str:
        return self.title


class Module(models.Model):
    """A unit of a course, e.g. "Module 5.1 · Prompt Injection"."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=300)
    # Grouping shown above the title, e.g. "Week 5 · Secure I".
    label = models.CharField(max_length=100, blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self) -> str:
        return self.title


class Lesson(models.Model):
    """One piece of content in a module: a video, SCORM package, game or quiz.

    `key_points` is a list of `{"title", "body"}`; `framework_tags` holds labels
    such as "OWASP LLM01:2025". `quiz` is graded as a whole when
    `content_type == "quiz"` (port of `submitQuiz`); on any other lesson it is a
    knowledge check answered one question at a time.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=300)
    order = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=20, choices=[(c, c) for c in CONTENT_TYPES])
    asset_ref = models.CharField(max_length=1024, blank=True, default="")
    external_url = models.URLField(max_length=2048, blank=True, default="")
    scorm_version = models.CharField(
        max_length=4, choices=[("1.2", "1.2"), ("2004", "2004")], blank=True, default=""
    )
    estimated_minutes = models.PositiveIntegerField(null=True, blank=True)
    framework_tags = models.JSONField(default=list, blank=True)
    key_points = models.JSONField(default=list, blank=True)
    quiz = models.ForeignKey(
        "assessments.Quiz", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self) -> str:
        return self.title


class Enrollment(models.Model):
    """A member's place in a course. Progress is recomputed by the server only."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="enrollments")
    member = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")
    assigned_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    due_at = models.DateTimeField(null=True, blank=True)
    progress_pct = models.PositiveSmallIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_activity_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["course", "member"], name="enrollment_unique"),
            models.CheckConstraint(
                condition=models.Q(progress_pct__lte=100), name="enrollment_progress_max_100"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.member_id} in {self.course_id}"


class LessonProgress(models.Model):
    """Per-lesson state: SCORM/cmi5 runtime data, score and first completion time."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="lessons")
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name="+")
    runtime = models.JSONField(default=dict, blank=True)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["enrollment", "lesson"], name="lesson_progress_unique")
        ]

    def __str__(self) -> str:
        return f"{self.enrollment_id} {self.lesson_id}"
