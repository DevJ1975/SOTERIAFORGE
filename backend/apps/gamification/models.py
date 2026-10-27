"""Gamification (platform plan Phase 3): the XP ledger, activity days, and the
cohort -> section -> crew structure the crew leaderboard ranks.

XP is an append-only ledger (a Postgres trigger and revoked privileges enforce it);
totals, levels and streaks are derived from it, so there is no counter to drift.
Every table carries `tenant` so row-level security applies directly.
"""

import uuid

from django.db import models
from django.utils import timezone


class XpSource(models.TextChoices):
    LESSON = "lesson", "Lesson completed"


class XpEvent(models.Model):
    """One XP award. Never updated or deleted; `amount` can't be negative."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    member = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, related_name="xp_events"
    )
    amount = models.PositiveIntegerField()  # PostgreSQL adds CHECK (amount >= 0)
    source = models.CharField(max_length=20, choices=XpSource)
    source_id = models.CharField(max_length=100)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            # One award per thing earned: replays and races can't pay out twice.
            models.UniqueConstraint(
                fields=["member", "source", "source_id"], name="xp_event_once_per_source"
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "created_at"]),
            models.Index(fields=["member", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.member_id} +{self.amount} ({self.source})"


class ActivityDay(models.Model):
    """A UTC day on which a member did something that counts toward the Pulse streak."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    member = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, related_name="activity_days"
    )
    day = models.DateField()

    class Meta:
        ordering = ["-day"]
        constraints = [
            models.UniqueConstraint(fields=["member", "day"], name="activity_day_unique")
        ]

    def __str__(self) -> str:
        return f"{self.member_id} {self.day}"


class Cohort(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    name = models.CharField(max_length=120)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-starts_on", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="cohort_name_unique"),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True)
                | models.Q(starts_on__isnull=True)
                | models.Q(ends_on__gte=models.F("starts_on")),
                name="cohort_dates_ordered",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Section(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="sections")
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["cohort", "name"], name="section_name_unique")
        ]

    def __str__(self) -> str:
        return self.name


class Crew(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    # Denormalized from the section so "one crew per member per cohort" is a DB constraint.
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="crews")
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="crews")
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["cohort", "name"], name="crew_name_unique")]

    def __str__(self) -> str:
        return self.name


class CrewMembership(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="+")
    crew = models.ForeignKey(Crew, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, related_name="crew_memberships"
    )
    is_lead = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cohort", "member"], name="one_crew_per_cohort"),
        ]

    def __str__(self) -> str:
        return f"{self.member_id} in {self.crew_id}"
