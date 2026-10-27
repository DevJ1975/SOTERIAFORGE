"""Server-authoritative lesson completion (port of `recordModuleCompletion`).

The enrollment row is locked for the whole decision, so two concurrent calls
(a quiz submission racing a completion, or an offline replay) agree on exactly
one first completion. XP, badges and streaks join this path in Phase 3.
"""

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from apps.audit.models import record

from .models import Enrollment, Lesson, LessonProgress


@dataclass(frozen=True)
class Completion:
    progress_pct: int
    completed: bool
    first_completion: bool

    def as_json(self) -> dict:
        return {
            "progressPct": self.progress_pct,
            "completed": self.completed,
            "firstCompletion": self.first_completion,
        }


def lock_enrollment(enrollment: Enrollment) -> Enrollment:
    """Re-read the enrollment under a row lock. Call inside `transaction.atomic()`."""
    return Enrollment.objects.select_for_update().get(pk=enrollment.pk)


def complete_lesson(enrollment: Enrollment, lesson: Lesson, *, score: int | None = None):
    with transaction.atomic():
        enrollment = lock_enrollment(enrollment)
        now = timezone.now()
        progress, _ = LessonProgress.objects.get_or_create(
            enrollment=enrollment, lesson=lesson, defaults={"tenant_id": enrollment.tenant_id}
        )
        first = progress.completed_at is None
        if first:
            progress.completed_at = now
        if score is not None:
            progress.score = score
        progress.save()

        total = Lesson.objects.filter(module__course_id=enrollment.course_id).count() or 1
        done = LessonProgress.objects.filter(
            enrollment=enrollment, completed_at__isnull=False
        ).count()
        enrollment.progress_pct = min(100, int(done * 100 / total + 0.5))  # Math.round
        course_finished = enrollment.progress_pct == 100 and enrollment.completed_at is None
        if course_finished:
            enrollment.completed_at = now
        enrollment.last_activity_at = now
        enrollment.save()

        if first:
            record(
                action="learning.lesson.completed",
                actor=enrollment.member,
                tenant=enrollment.tenant,
                target=lesson,
                enrollment=str(enrollment.pk),
                score=score,
            )
        if course_finished:
            record(
                action="learning.course.completed",
                actor=enrollment.member,
                tenant=enrollment.tenant,
                target=enrollment.course,
                enrollment=str(enrollment.pk),
            )
    return Completion(enrollment.progress_pct, enrollment.completed_at is not None, first)


def touch(enrollment: Enrollment) -> None:
    Enrollment.objects.filter(pk=enrollment.pk).update(
        last_activity_at=timezone.now(), updated_at=timezone.now()
    )
