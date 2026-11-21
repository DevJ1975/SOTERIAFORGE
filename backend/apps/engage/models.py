import uuid

from django.db import models

MAX_PARTICIPANTS = 21


POLL_POINTS = 5

DEFAULT_STAGES = [
    {"key": "teach", "label": "Teach", "minutes": 10},
    {"key": "hunt", "label": "Hunt", "minutes": 3},
    {"key": "huddle", "label": "Huddle", "minutes": 6},
    {"key": "report", "label": "Report", "minutes": 6},
    {"key": "debrief", "label": "Debrief", "minutes": 5},
]


def default_stages() -> list[dict]:
    return [dict(stage) for stage in DEFAULT_STAGES]


class Classroom(models.Model):
    """A reusable room. With a cohort set, only that cohort's learners (and staff) join."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    created_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT)
    title = models.CharField(max_length=120)
    cohort = models.ForeignKey(
        "gamification.Cohort", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def room_name(self) -> str:
        return f"forge-{self.tenant_id}-{self.pk}"


class Session(models.Model):
    """One live class in a classroom: the block bar, activities, notes and attendance.

    Every time the shared state changes `version` goes up, and clients refetch when they
    see a newer one. All times are the server's.
    """

    class Status(models.TextChoices):
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE, related_name="sessions")
    title = models.CharField(max_length=120)
    status = models.CharField(max_length=8, choices=Status, default=Status.LIVE)
    started_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    stages = models.JSONField(default=default_stages)
    block_count = models.PositiveSmallIntegerField(default=4)
    block = models.PositiveSmallIntegerField(default=1)  # 1-based
    stage = models.PositiveSmallIntegerField(default=0)  # index into `stages`
    stage_started_at = models.DateTimeField()
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["classroom"],
                condition=models.Q(status="live"),
                name="one_live_session_per_classroom",
            )
        ]

    def __str__(self) -> str:
        return self.title


class Activity(models.Model):
    """A live poll or a Threat Hunt. It opens when created and closes on its own."""

    class Kind(models.TextChoices):
        POLL = "poll", "Live poll"
        HUNT = "hunt", "Threat Hunt"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="activities")
    kind = models.CharField(max_length=8, choices=Kind)
    prompt = models.CharField(max_length=300)
    # [{"id": "a", "label": ..., "detail": ...}]
    options = models.JSONField()
    # Hunts only. Never sent to learners while the hunt is open.
    correct_option = models.CharField(max_length=8, blank=True, default="")
    xp = models.PositiveSmallIntegerField(default=0)
    block = models.PositiveSmallIntegerField()
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    created_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["opens_at", "id"]

    def __str__(self) -> str:
        return self.prompt


class Response(models.Model):
    """One member's answer. `answered_at` is the server's clock: it decides order."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    activity = models.ForeignKey(Activity, on_delete=models.CASCADE, related_name="responses")
    member = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")
    option = models.CharField(max_length=8)
    correct = models.BooleanField(null=True)  # null for polls
    points = models.PositiveSmallIntegerField(default=0)
    answered_at = models.DateTimeField()

    class Meta:
        ordering = ["answered_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["activity", "member"], name="one_response_per_member")
        ]

    def __str__(self) -> str:
        return f"{self.activity_id}:{self.member_id}"


class HuddleNote(models.Model):
    """A crew's shared notes for one block of a session."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="notes")
    crew = models.ForeignKey("gamification.Crew", on_delete=models.CASCADE, related_name="+")
    block = models.PositiveSmallIntegerField()
    text = models.TextField(blank=True, default="")
    updated_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["session", "crew", "block"], name="one_note_per_crew_block"
            )
        ]

    def __str__(self) -> str:
        return f"{self.session_id}:{self.crew_id}:{self.block}"


class Attendance(models.Model):
    """Who was present in a session, from authenticated heartbeats while connected."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="attendance")
    member = models.ForeignKey("accounts.Member", on_delete=models.PROTECT, related_name="+")
    first_joined_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    seconds = models.PositiveIntegerField(default=0)
    hand_raised_at = models.DateTimeField(null=True, blank=True)
    # Set when a host removes them: they cannot rejoin this session.
    removed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["first_joined_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["session", "member"], name="one_attendance_row")
        ]

    def __str__(self) -> str:
        return f"{self.session_id}:{self.member_id}"
