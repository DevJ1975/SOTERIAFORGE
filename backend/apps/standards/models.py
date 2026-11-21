import uuid

from django.db import models


class Package(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PROCESSING = "processing"
        READY = "ready"
        FAILED = "failed"
        ARCHIVED = "archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    created_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT)
    title = models.CharField(max_length=300)
    status = models.CharField(max_length=20, choices=Status, default=Status.PENDING)
    sha256 = models.CharField(max_length=64)
    scorm_version = models.CharField(max_length=4, blank=True)
    launch_path = models.CharField(max_length=1024, blank=True)
    files = models.JSONField(default=dict)
    error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Binding(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    lesson = models.OneToOneField("learning.Lesson", on_delete=models.PROTECT)
    package = models.ForeignKey(Package, on_delete=models.PROTECT)

    def __str__(self):
        return str(self.lesson_id)


class Launch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    enrollment = models.ForeignKey("learning.Enrollment", on_delete=models.PROTECT)
    binding = models.ForeignKey(Binding, on_delete=models.PROTECT)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)
    sequence = models.PositiveIntegerField(default=0)
    last_hash = models.CharField(max_length=64, blank=True)
    last_result = models.JSONField(default=dict)
    runtime = models.JSONField(default=dict)

    def __str__(self):
        return str(self.pk)


class Statement(models.Model):
    """Transactional outbox, not an LRS. Payload/ID remain immutable across delivery retries."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    event_key = models.CharField(max_length=200)
    payload = models.JSONField()
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    delivered_at = models.DateTimeField(null=True)
    last_error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tenant", "event_key"], name="standards_event_once")
        ]
        indexes = [models.Index(fields=["delivered_at", "next_attempt_at"])]

    def __str__(self):
        return str(self.pk)


class AuSession(models.Model):
    """One cmi5 launch of an Assignable Unit (a `cmi5` or `unity` lesson).

    The fetch secret and the auth token are stored only as SHA-256 hashes. The
    registration the AU sees is the enrollment id; this row is the cmi5 session.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    enrollment = models.ForeignKey("learning.Enrollment", on_delete=models.PROTECT)
    lesson = models.ForeignKey("learning.Lesson", on_delete=models.PROTECT, related_name="+")
    au_url = models.CharField(max_length=2048)
    fetch_hash = models.CharField(max_length=64)
    fetch_used_at = models.DateTimeField(null=True)
    token_hash = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)
    initialized_at = models.DateTimeField(null=True)
    completed_at = models.DateTimeField(null=True)
    # True after `passed`, False after `failed`, None while unjudged.
    success = models.BooleanField(null=True)
    terminated_at = models.DateTimeField(null=True)
    # Latest reported score as a 0-100 percentage.
    score = models.PositiveSmallIntegerField(null=True)
    statement_count = models.PositiveIntegerField(default=0)
    # The learning completion (progress, XP, badges) the host app shows the learner.
    completion = models.JSONField(null=True)
    # Simulator lessons: the lesson's scenario as it was at launch, the seed for this
    # run, and what the server's replay of the action log found (apps/games/sim.py).
    scenario = models.JSONField(null=True)
    seed = models.PositiveBigIntegerField(null=True)
    outcome = models.JSONField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["enrollment", "lesson"])]

    def __str__(self):
        return str(self.pk)


class AuStatement(models.Model):
    """An xAPI statement received from an AU, stored as stamped by the server."""

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    session = models.ForeignKey(AuSession, on_delete=models.PROTECT, related_name="statements")
    statement_id = models.UUIDField()
    verb = models.CharField(max_length=300)
    # Hash of the statement as the AU sent it, so a retry is told apart from a conflict.
    digest = models.CharField(max_length=64)
    payload = models.JSONField()
    stored_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "statement_id"], name="standards_au_statement_once"
            )
        ]

    def __str__(self):
        return str(self.statement_id)


class Scenario(models.Model):
    """The simulator scenario a `cmi5` / `unity` lesson is scored against.

    `data` is a forge-sim scenario (rust/README.md). A lesson with one completes only
    when the server's replay of the learner's action log passes.
    """

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    lesson = models.OneToOneField(
        "learning.Lesson", on_delete=models.CASCADE, related_name="sim_scenario"
    )
    data = models.JSONField()
    updated_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(self.lesson_id)
