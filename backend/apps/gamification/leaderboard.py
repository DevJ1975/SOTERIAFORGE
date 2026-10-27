"""Crew leaderboard and the private score card.

Crews are ranked, learners never are: nothing returned here names or identifies a
member. A crew's score is the average XP per crew member for the period, so a large
crew has no head start over a small one. Daily and weekly boards are date windows
over the XP ledger (UTC), so there are no reset jobs to run or to miss.
"""

from collections import defaultdict
from datetime import UTC, datetime, time, timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from .awards import streak_for, total_xp
from .levels import level_progress
from .models import ActivityDay, Cohort, Crew, CrewMembership, XpEvent
from .streaks import STRIP_DAYS, strip

PERIODS = ("daily", "weekly", "allTime")
SCORING = "average_xp_per_member"


def window_start(period: str, now):
    today = now.astimezone(UTC).date()
    if period == "daily":
        return datetime.combine(today, time.min, tzinfo=UTC)
    if period == "weekly":  # ISO week: Monday 00:00 UTC
        monday = today - timedelta(days=today.weekday())
        return datetime.combine(monday, time.min, tzinfo=UTC)
    return None  # allTime


def member_cohort(member) -> Cohort | None:
    """The cohort a member is currently in: the one that started most recently."""
    membership = (
        CrewMembership.objects.filter(member=member)
        .select_related("cohort")
        .order_by("-cohort__starts_on", "-cohort__created_at")
        .first()
    )
    return membership.cohort if membership else None


def rank_crews(cohort: Cohort, period: str, now=None) -> list[dict]:
    now = now or timezone.now()
    start = window_start(period, now)

    sizes = dict(
        CrewMembership.objects.filter(cohort=cohort)
        .values_list("crew_id")
        .annotate(n=Count("id"))
        .values_list("crew_id", "n")
    )
    events = XpEvent.objects.filter(member__crew_memberships__cohort=cohort)
    if start is not None:
        events = events.filter(created_at__gte=start)
    totals = defaultdict(int)
    for crew_id, total in events.values_list("member__crew_memberships__crew").annotate(
        total=Sum("amount")
    ):
        totals[crew_id] = total

    rows = []
    for crew in Crew.objects.filter(cohort=cohort):
        size = sizes.get(crew.pk, 0)
        total = totals.get(crew.pk, 0)
        score = int(total / size + 0.5) if size else 0  # Math.round: half rounds up
        rows.append(
            {
                "crewId": str(crew.pk),
                "name": crew.name,
                "score": score,
                "totalXp": total,
                "memberCount": size,
            }
        )
    rows.sort(key=lambda r: (-r["score"], -r["totalXp"], r["name"].lower()))
    previous = None
    for index, row in enumerate(rows, start=1):
        key = (row["score"], row["totalXp"])
        row["rank"] = rows[index - 2]["rank"] if previous == key else index  # ties share a rank
        previous = key
    return rows


def crew_board(member, period: str, *, cohort: Cohort | None = None, now=None) -> dict:
    cohort = cohort or member_cohort(member)
    if cohort is None:
        return {"period": period, "scoring": SCORING, "cohort": None, "crews": []}
    mine = (
        CrewMembership.objects.filter(member=member, cohort=cohort).values_list(
            "crew_id", flat=True
        )
    ).first()
    crews = [{**row, "mine": row["crewId"] == str(mine)} for row in rank_crews(cohort, period, now)]
    return {
        "period": period,
        "scoring": SCORING,
        "cohort": {"id": str(cohort.pk), "name": cohort.name},
        "crews": crews,
    }


def score_card(member, now=None) -> dict:
    """Everything a learner sees about themselves on My Progress. Private: self only."""
    now = now or timezone.now()
    today = now.astimezone(UTC).date()
    total = total_xp(member)
    since = today - timedelta(days=STRIP_DAYS - 1)
    days = ActivityDay.objects.filter(member=member, day__gte=since).values_list("day", flat=True)
    today_xp = (
        XpEvent.objects.filter(member=member, created_at__gte=window_start("daily", now)).aggregate(
            total=Sum("amount")
        )["total"]
        or 0
    )
    crew = None
    cohort = member_cohort(member)
    if cohort is not None:
        membership = (
            CrewMembership.objects.filter(member=member, cohort=cohort)
            .select_related("crew")
            .first()
        )
        board = rank_crews(cohort, "allTime", now)
        row = next((r for r in board if r["crewId"] == str(membership.crew_id)), None)
        crew = {
            "id": str(membership.crew_id),
            "name": membership.crew.name,
            "isLead": membership.is_lead,
            "rank": row["rank"] if row else None,
            "score": row["score"] if row else 0,
            "cohort": cohort.name,
        }
    return {
        "totalXp": total,
        "todayXp": today_xp,
        **level_progress(total).as_json(),
        "streakDays": streak_for(member, today),
        "strip": strip(days, today),
        "crew": crew,
    }
