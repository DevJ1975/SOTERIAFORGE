"""Cohort analytics and the at-risk list for instructors.

Everything here is a plain rule over rows staff can already see, so a flag can always
be explained to the learner it is about. The sizes are a pilot's (hundreds of
enrollments), so the work is done in Python rather than in SQL.
"""

import uuid
from collections import defaultdict
from datetime import timedelta
from statistics import median

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Member, Role
from apps.assessments.models import CheckAnswer
from apps.engage.models import Attendance, Session
from apps.gamification.models import ActivityDay, CrewMembership
from apps.learning.models import Enrollment, Lesson, LessonProgress

INACTIVE_DAYS = 7
BEHIND_POINTS = 25
BEHIND_MIN_GROUP = 4
FIRST_TRY_PCT = 60
FIRST_TRY_MIN_ANSWERS = 5
SESSIONS_CONSIDERED = 3
MISSED_SESSIONS = 2
WEEKS = 8

RULES = {
    "inactiveDays": INACTIVE_DAYS,
    "behindPoints": BEHIND_POINTS,
    "firstTryPct": FIRST_TRY_PCT,
    "missedSessions": MISSED_SESSIONS,
}


def _uuid(request, name: str) -> uuid.UUID | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError as error:
        raise ValidationError({name: "Not a valid id."}) from error


class Scope:
    """The learners' enrollments a report covers: a tenant, narrowed by course and cohort."""

    def __init__(self, request, tenant):
        self.tenant = tenant
        self.course_id = _uuid(request, "courseId")
        self.cohort_id = _uuid(request, "cohortId")
        rows = Enrollment.objects.filter(
            tenant=tenant, member__role=Role.LEARNER, member__status=Member.Status.ACTIVE
        ).select_related("member", "course")
        if self.course_id:
            rows = rows.filter(course_id=self.course_id)
        memberships = CrewMembership.objects.filter(tenant=tenant).select_related("crew", "cohort")
        if self.cohort_id:
            memberships = memberships.filter(cohort_id=self.cohort_id)
            rows = rows.filter(member_id__in=memberships.values("member_id"))
        self.enrollments = list(rows)
        self.member_ids = {e.member_id for e in self.enrollments}
        self.memberships = defaultdict(list)
        for membership in memberships.order_by("-cohort__starts_on", "cohort__name"):
            if membership.member_id in self.member_ids:
                self.memberships[membership.member_id].append(membership)

    def first_try(self) -> dict:
        """Per enrollment and lesson: (first-try correct, answered)."""
        counts: dict = defaultdict(lambda: [0, 0])
        answers = CheckAnswer.objects.filter(
            enrollment__in=[e.pk for e in self.enrollments]
        ).values_list("enrollment_id", "lesson_id", "first_correct")
        for enrollment_id, lesson_id, correct in answers:
            pair = counts[(enrollment_id, lesson_id)]
            pair[0] += bool(correct)
            pair[1] += 1
        return counts


def _pct(correct: int, total: int) -> int | None:
    return round(100 * correct / total) if total else None


def _mean(values) -> int:
    values = list(values)
    return round(sum(values) / len(values)) if values else 0


def _rate(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def analytics(scope: Scope) -> dict:
    now = timezone.now()
    enrollments = scope.enrollments
    first_try = scope.first_try()
    completions = sum(1 for e in enrollments if e.completed_at)
    week_ago = now - timedelta(days=INACTIVE_DAYS)

    by_course: dict = defaultdict(list)
    for enrollment in enrollments:
        by_course[enrollment.course_id].append(enrollment)

    lessons = []
    if scope.course_id:
        done: dict = defaultdict(int)
        for lesson_id in LessonProgress.objects.filter(
            enrollment__in=[e.pk for e in enrollments], completed_at__isnull=False
        ).values_list("lesson_id", flat=True):
            done[lesson_id] += 1
        per_lesson: dict = defaultdict(lambda: [0, 0])
        for (_, lesson_id), (correct, total) in first_try.items():
            per_lesson[lesson_id][0] += correct
            per_lesson[lesson_id][1] += total
        for lesson in (
            Lesson.objects.filter(tenant=scope.tenant, module__course_id=scope.course_id)
            .select_related("module")
            .order_by("module__order", "order")
        ):
            lessons.append(
                {
                    "lessonId": lesson.pk,
                    "title": lesson.title,
                    "moduleTitle": lesson.module.title,
                    "completions": done[lesson.pk],
                    "enrollments": len(enrollments),
                    "firstTryPct": _pct(*per_lesson[lesson.pk]),
                }
            )

    monday = (now - timedelta(days=now.weekday())).date()
    starts = [monday - timedelta(weeks=n) for n in range(WEEKS - 1, -1, -1)]
    active: dict = defaultdict(set)
    for member_id, day in ActivityDay.objects.filter(
        tenant=scope.tenant, member_id__in=scope.member_ids, day__gte=starts[0]
    ).values_list("member_id", "day"):
        active[day - timedelta(days=day.weekday())].add(member_id)
    finished: dict = defaultdict(int)
    for completed_at in LessonProgress.objects.filter(
        enrollment__in=[e.pk for e in enrollments], completed_at__date__gte=starts[0]
    ).values_list("completed_at", flat=True):
        day = completed_at.date()
        finished[day - timedelta(days=day.weekday())] += 1

    return {
        "generatedAt": now,
        "totals": {
            "learners": len(scope.member_ids),
            "activeLast7Days": len(
                {
                    e.member_id
                    for e in enrollments
                    if e.last_activity_at and e.last_activity_at >= week_ago
                }
            ),
            "enrollments": len(enrollments),
            "completions": completions,
            "completionRate": _rate(completions, len(enrollments)),
            "averageProgressPct": _mean(e.progress_pct for e in enrollments),
            "firstTryPct": _pct(
                sum(c for c, _ in first_try.values()), sum(t for _, t in first_try.values())
            ),
        },
        "courses": sorted(
            (
                {
                    "courseId": course_id,
                    "title": rows[0].course.title,
                    "enrollments": len(rows),
                    "completions": sum(1 for e in rows if e.completed_at),
                    "averageProgressPct": _mean(e.progress_pct for e in rows),
                }
                for course_id, rows in by_course.items()
            ),
            key=lambda row: row["title"].lower(),
        ),
        "lessons": lessons,
        "weeks": [
            {
                "weekStart": start,
                "activeLearners": len(active[start]),
                "lessonsCompleted": finished[start],
            }
            for start in starts
        ],
    }


def _missed_sessions(scope: Scope) -> dict:
    """Per member: how many of their cohort's last few ended live sessions they missed."""
    cohort_ids = {m.cohort_id for rows in scope.memberships.values() for m in rows}
    if not cohort_ids:
        return {}
    recent: dict = defaultdict(list)
    sessions = Session.objects.filter(
        tenant=scope.tenant, status=Session.Status.ENDED, classroom__cohort_id__in=cohort_ids
    ).order_by("-ended_at")
    for session_id, cohort_id in sessions.values_list("pk", "classroom__cohort_id"):
        if len(recent[cohort_id]) < SESSIONS_CONSIDERED:
            recent[cohort_id].append(session_id)
    attended = set(
        Attendance.objects.filter(
            session__in=[pk for ids in recent.values() for pk in ids]
        ).values_list("session_id", "member_id")
    )
    missed = {}
    for member_id, rows in scope.memberships.items():
        missed[member_id] = sum(
            1
            for membership in rows
            for session_id in recent[membership.cohort_id]
            if (session_id, member_id) not in attended
        )
    return missed


def at_risk(scope: Scope) -> dict:
    now = timezone.now()
    cutoff = now - timedelta(days=INACTIVE_DAYS)
    first_try = scope.first_try()
    missed = _missed_sessions(scope)

    medians = {}
    by_course: dict = defaultdict(list)
    by_member: dict = defaultdict(list)
    for enrollment in scope.enrollments:
        by_course[enrollment.course_id].append(enrollment.progress_pct)
        by_member[enrollment.member_id].append(enrollment)
    for course_id, values in by_course.items():
        if len(values) >= BEHIND_MIN_GROUP:
            medians[course_id] = median(values)

    answers: dict = defaultdict(lambda: [0, 0])
    owner = {e.pk: e.member_id for e in scope.enrollments}
    for (enrollment_id, _), (correct, total) in first_try.items():
        answers[owner[enrollment_id]][0] += correct
        answers[owner[enrollment_id]][1] += total

    learners = []
    for member_id, rows in by_member.items():
        member = rows[0].member
        unfinished = [e for e in rows if e.completed_at is None]
        last_activity = max((e.last_activity_at for e in rows if e.last_activity_at), default=None)
        correct, total = answers[member_id]
        reasons = []
        if unfinished and (last_activity or min(e.created_at for e in rows)) < cutoff:
            reasons.append("inactive")
        if any(e.due_at and e.due_at < now for e in unfinished):
            reasons.append("overdue")
        if any(
            e.course_id in medians and e.progress_pct <= medians[e.course_id] - BEHIND_POINTS
            for e in unfinished
        ):
            reasons.append("behind")
        if total >= FIRST_TRY_MIN_ANSWERS and 100 * correct / total < FIRST_TRY_PCT:
            reasons.append("low_scores")
        if missed.get(member_id, 0) >= MISSED_SESSIONS:
            reasons.append("missed_sessions")
        if not reasons:
            continue
        membership = next(iter(scope.memberships.get(member_id, [])), None)
        learners.append(
            {
                "memberId": member_id,
                "memberName": member.display_name or member.email,
                "email": member.email,
                "cohortName": membership.cohort.name if membership else None,
                "crewName": membership.crew.name if membership else None,
                "progressPct": _mean(e.progress_pct for e in rows),
                "lastActivityAt": last_activity,
                "firstTryPct": _pct(correct, total),
                "sessionsMissed": missed.get(member_id, 0),
                "reasons": reasons,
            }
        )
    learners.sort(
        key=lambda row: (
            -len(row["reasons"]),
            row["lastActivityAt"].timestamp() if row["lastActivityAt"] else 0,
            row["memberName"].lower(),
        )
    )
    return {"generatedAt": now, "rules": RULES, "learners": learners}
