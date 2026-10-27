import uuid

from django.db import models
from pgvector.django import VectorField

from .profiles import Agent


class Source(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    course = models.ForeignKey("learning.Course", on_delete=models.CASCADE)
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
