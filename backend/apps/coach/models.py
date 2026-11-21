import uuid

from django.db import models
from pgvector.django import VectorField

from .profiles import Agent


class Source(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    course = models.ForeignKey("learning.Course", on_delete=models.CASCADE)
    # Null: the whole course. Set: only questions asked from this module retrieve it.
    module = models.ForeignKey(
        "learning.Module", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    title = models.CharField(max_length=300)
    agent = models.CharField(max_length=32, choices=Agent, default=Agent.GENERAL)
    reference_url = models.URLField(max_length=2048, blank=True, default="")
    edition = models.CharField(max_length=200, blank=True, default="")
    content_hash = models.CharField(max_length=64)
    embedding_digest = models.CharField(max_length=64)
    approved_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title", "id"]

    def __str__(self) -> str:
        return self.title


class Chunk(models.Model):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="chunks")
    ordinal = models.PositiveIntegerField()
    page = models.PositiveIntegerField(null=True)
    text = models.TextField()
    embedding = VectorField(dimensions=1024)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["source", "ordinal"], name="coach_chunk_ordinal")
        ]

    def __str__(self) -> str:
        return f"{self.source_id}:{self.ordinal}"


class Exchange(models.Model):
    """One question and its answer, kept for the thumbs and the staff review queue.

    Pseudonymized: `learner` is a keyed hash of the member, so staff can see that two
    questions came from the same person without seeing who. The question is stored
    after `guardrails.redact`. Rows are deleted by `purge_coach_log` after
    COACH_LOG_RETENTION_DAYS.
    """

    class Rating(models.TextChoices):
        UP = "up", "Helpful"
        DOWN = "down", "Not helpful"

    class ReviewStatus(models.TextChoices):
        OPEN = "open", "Open"
        REVIEWED = "reviewed", "Reviewed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    course = models.ForeignKey("learning.Course", on_delete=models.CASCADE)
    module = models.ForeignKey(
        "learning.Module", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    agent = models.CharField(max_length=32, choices=Agent, default=Agent.GENERAL)
    learner = models.CharField(max_length=32)
    question = models.TextField()
    answer = models.TextField()
    abstained = models.BooleanField(default=False)
    # Why a guardrail refused it without calling the model (guardrails.py); "" otherwise.
    blocked = models.CharField(max_length=16, blank=True, default="")
    citations = models.JSONField(default=list)
    diagram = models.JSONField(null=True, blank=True)
    rating = models.CharField(max_length=4, choices=Rating, blank=True, default="")
    rating_note = models.CharField(max_length=500, blank=True, default="")
    review_status = models.CharField(max_length=8, choices=ReviewStatus, default=ReviewStatus.OPEN)
    review_note = models.CharField(max_length=1000, blank=True, default="")
    reviewed_by = models.ForeignKey(
        "accounts.Member", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "id"]
        indexes = [models.Index(fields=["tenant", "created_at"], name="coach_exchange_recent")]

    def __str__(self) -> str:
        return f"{self.learner}:{self.created_at:%Y-%m-%d}"
