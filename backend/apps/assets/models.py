import uuid

from django.db import models

ASSET_REF_PREFIX = "asset:"


def parse_asset_ref(ref: str) -> uuid.UUID | None:
    """The asset id inside a lesson's `assetRef` ("asset:<id>"), else None."""
    if not ref.startswith(ASSET_REF_PREFIX):
        return None
    try:
        return uuid.UUID(ref[len(ASSET_REF_PREFIX) :])
    except ValueError:
        return None


class Asset(models.Model):
    """An uploaded file (video, audio, image, PDF, package) in the private bucket.

    Lessons store `ref` ("asset:<id>") in `asset_ref`; learners get a short-lived
    signed URL instead of the bucket key.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    key = models.CharField(max_length=1024)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    created_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.filename

    @property
    def ref(self) -> str:
        return f"{ASSET_REF_PREFIX}{self.pk}"
