"""The one place XP is awarded. Server-authoritative, idempotent, never negative.

Call inside the transaction that earned it (the lesson-completion path holds the
enrollment row lock). Each (member, source, source_id) pays out once; a replay or a
race hits the unique key and awards nothing.
"""

from dataclasses import dataclass
from datetime import UTC, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audit.models import record

from .levels import level_from_xp
from .models import ActivityDay, XpEvent, XpSource
from .streaks import current_streak

# Quiz scoring, ported from submitQuiz: XP per correct point on a pass.
XP_PER_QUIZ_POINT = 10
# Streak lookback; far longer than any realistic run still needs one query.
STREAK_LOOKBACK_DAYS = 400


@dataclass(frozen=True)
class Award:
    """What the award overlay shows after a first completion."""

    awarded: int
    total_xp: int
    level: int
    leveled_up: bool
    streak_days: int
    streak_extended: bool
    # Badges this completion earned, as (id, key, name, icon, kind) tuples.
    badges: tuple = ()

    def as_json(self) -> dict:
        return {
            "awarded": self.awarded,
            "totalXp": self.total_xp,
            "level": self.level,
            "leveledUp": self.leveled_up,
            "streakDays": self.streak_days,
            "streakExtended": self.streak_extended,
            "badges": [
                {"id": i, "key": k, "name": n, "icon": ic, "kind": kd}
                for i, k, n, ic, kd in self.badges
            ],
        }


def total_xp(member) -> int:
    return XpEvent.objects.filter(member=member).aggregate(total=Sum("amount"))["total"] or 0


def streak_for(member, today) -> int:
    since = today - timedelta(days=STREAK_LOOKBACK_DAYS)
    days = ActivityDay.objects.filter(member=member, day__gte=since).values_list("day", flat=True)
    return current_streak(days, today)


def award_xp(*, tenant, member, amount: int, source: str, source_id: str, now=None) -> Award:
    """Record `amount` XP for something the member just earned, and count today as an
    active Pulse day. Returns the post-award state; `awarded` is 0 for a replay."""
    now = now or timezone.now()
    today = now.astimezone(UTC).date()
    amount = max(0, int(amount))  # XP only ever moves forward
    before = total_xp(member)
    streak_before = streak_for(member, today)

    awarded = 0
    if amount > 0:
        try:
            with transaction.atomic():  # savepoint: a duplicate must not poison the caller's tx
                event = XpEvent.objects.create(
                    tenant=tenant,
                    member=member,
                    amount=amount,
                    source=source,
                    source_id=str(source_id),
                    created_at=now,
                )
        except IntegrityError:
            event = None  # already paid for this one
        if event is not None:
            awarded = amount
            record(
                action="gamification.xp.awarded",
                actor=member,
                tenant=tenant,
                target=event,
                amount=amount,
                source=source,
                source_id=str(source_id),
            )

    ActivityDay.objects.get_or_create(member=member, day=today, defaults={"tenant": tenant})
    after = before + awarded
    streak_after = streak_for(member, today)
    return Award(
        awarded=awarded,
        total_xp=after,
        level=level_from_xp(after),
        leveled_up=level_from_xp(after) > level_from_xp(before),
        streak_days=streak_after,
        streak_extended=streak_after > streak_before,
    )


def award_lesson(*, enrollment, lesson, extra_xp: int = 0, now=None) -> Award:
    """XP for a lesson's first completion: its authored reward plus any quiz points."""
    return award_xp(
        tenant=enrollment.tenant,
        member=enrollment.member,
        amount=lesson.xp_reward + max(0, extra_xp),
        source=XpSource.LESSON,
        source_id=str(lesson.pk),
        now=now,
    )
