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
