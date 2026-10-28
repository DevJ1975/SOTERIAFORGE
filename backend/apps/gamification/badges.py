"""Badge rules: what a member has done, and which badges that earns.

`evaluate` runs inside the lesson-completion transaction (the enrollment row is
locked), so an award is decided once. Progress is always derived from the records
that earned it, never from a counter.
"""

from datetime import UTC

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils import timezone

from apps.assessments.models import QuizAttempt
from apps.audit.models import record
from apps.learning.models import Enrollment, LessonProgress

from .awards import streak_for, total_xp
from .levels import level_from_xp
from .models import Badge, BadgeAward, BadgeRule

# The catalog every new tenant starts with. Admins can edit or retire any of it.
DEFAULT_BADGES = [
    (
        "recruit",
        "Recruit",
        "badge-recruit",
        "mission",
        "lessons_completed",
        1,
        "Complete a lesson.",
    ),
    (
        "operator",
        "Operator",
        "badge-operator",
        "mission",
        "lessons_completed",
        5,
        "Complete 5 lessons.",
    ),
    (
        "analyst",
        "Analyst",
        "badge-analyst",
        "mission",
        "quizzes_passed",
        3,
        "Pass 3 graded quizzes.",
    ),
    (
        "red-cell",
        "Red Cell",
        "badge-shield",
        "mission",
        "streak_days",
        3,
        "Keep a 3-day Pulse streak.",
    ),
    ("blue-cell", "Blue Cell", "badge-shield", "mission", "level", 3, "Reach level 3."),
    (
        "field-ready",
        "Field Ready",
        "badge-shield",
        "mission",
        "course_completed",
        1,
        "Finish a course.",
    ),
    (
        "crew-lead",
        "Crew Lead",
        "users-crew",
        "mission",
        "manual",
        1,
        "Signed off by your instructor.",
    ),
    (
        "ai-ready-professional",
        "AI-Ready Professional",
        "badge-shield-check",
        "credential",
        "manual",
        1,
        "Instructor-verified credential.",
    ),
]


def ensure_default_badges(tenant) -> None:
    """Create the starter catalog for `tenant`; existing badges are left alone."""
    for order, (key, name, icon, kind, rule, target, text) in enumerate(DEFAULT_BADGES):
        Badge.objects.get_or_create(
            tenant=tenant,
            key=key,
            defaults={
                "name": name,
                "icon": icon,
                "kind": kind,
                "rule": rule,
                "target": target,
                "description": text,
                "order": order,
            },
        )


def measures(member, now=None) -> dict[str, int]:
    """The numbers the automatic rules compare against `Badge.target`."""
    now = now or timezone.now()
    xp = total_xp(member)
    return {
        BadgeRule.LESSONS_COMPLETED: LessonProgress.objects.filter(
            enrollment__member=member, completed_at__isnull=False
        ).count(),
        BadgeRule.COURSE_COMPLETED: Enrollment.objects.filter(
            member=member, completed_at__isnull=False
        ).count(),
        BadgeRule.QUIZZES_PASSED: QuizAttempt.objects.filter(enrollment__member=member, passed=True)
        .values("lesson_id")
        .aggregate(n=Count("lesson_id", distinct=True))["n"],
        BadgeRule.STREAK_DAYS: streak_for(member, now.astimezone(UTC).date()),
        BadgeRule.LEVEL: level_from_xp(xp),
        BadgeRule.XP_TOTAL: xp,
    }


def evaluate(*, tenant, member, now=None) -> list[Badge]:
    """Award every active automatic badge the member now qualifies for.

    Returns the badges newly earned by this call (empty when nothing changed).
    """
    now = now or timezone.now()
    held = set(BadgeAward.objects.filter(member=member).values_list("badge_id", flat=True))
    pending = (
        Badge.objects.filter(tenant=tenant, active=True)
        .exclude(rule=BadgeRule.MANUAL)
        .exclude(pk__in=held)
    )
    if not pending:
        return []
    values = measures(member, now)
    earned = []
    for badge in pending:
        if values.get(badge.rule, 0) >= badge.target and grant(badge=badge, member=member, now=now):
            earned.append(badge)
    return earned


def grant(*, badge: Badge, member, by=None, now=None) -> bool:
    """Record an award. False if the member already held it (a replay or a race)."""
    try:
        with transaction.atomic():
            award = BadgeAward.objects.create(
                tenant=badge.tenant,
                member=member,
                badge=badge,
                awarded_by=by,
                awarded_at=now or timezone.now(),
            )
    except IntegrityError:
        return False
    record(
        action="gamification.badge.awarded",
        actor=by or member,
        tenant=badge.tenant,
        target=award,
        badge=badge.key,
        member=str(member.pk),
        signed_off=by is not None,
    )
    return True


def catalog_for(member, tenant) -> list[dict]:
    """The member's view of the catalog: state and progress for every active badge."""
    values = measures(member)
    awards = {a.badge_id: a for a in BadgeAward.objects.filter(member=member)}
    rows = []
    for badge in Badge.objects.filter(tenant=tenant, active=True):
        award = awards.get(badge.pk)
        manual = badge.rule == BadgeRule.MANUAL
        current = min(values.get(badge.rule, 0), badge.target) if not manual else 0
        # Everyone starts at level 1, which isn't progress toward a higher level.
        started = current > (1 if badge.rule == BadgeRule.LEVEL else 0)
        if award:
            state = "credential" if badge.kind == Badge.Kind.CREDENTIAL else "earned"
        elif started:
            state = "progress"
        else:
            state = "locked"
        rows.append(
            {
                "id": str(badge.pk),
                "key": badge.key,
                "name": badge.name,
                "description": badge.description,
                "icon": badge.icon,
                "kind": badge.kind,
                "state": state,
                "progress": None if manual else {"current": current, "target": badge.target},
                "earnedAt": award.awarded_at.isoformat() if award else None,
            }
        )
    return rows
