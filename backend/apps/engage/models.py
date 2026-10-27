import uuid

from django.db import models

MAX_PARTICIPANTS = 21


class Classroom(models.Model):
    """Tenant-wide classroom. Cohort-restricted enrollment is a later extension."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    created_by = models.ForeignKey("accounts.Member", on_delete=models.PROTECT)
    title = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def room_name(self) -> str:
        return f"forge-{self.tenant_id}-{self.pk}"
