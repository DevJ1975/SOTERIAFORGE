from django.db import models


class AuditEntry(models.Model):
    """Append-only record of every grade, XP, badge, credential and role action.

    Written in the same transaction as the change it records (see `record`).
    Rows are never updated or deleted by the application.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    actor = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    action = models.CharField(max_length=100)  # e.g. "member.role.set"
    target_type = models.CharField(max_length=50, blank=True, default="")
    target_id = models.CharField(max_length=128, blank=True, default="")
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["tenant", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.target_type}:{self.target_id}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise RuntimeError("Audit entries are append-only")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Audit entries are append-only")


def record(*, action: str, actor=None, tenant=None, target=None, **details) -> AuditEntry:
    """Append an audit entry. Call inside the transaction that makes the change."""
    return AuditEntry.objects.create(
        action=action,
        actor=actor,
        tenant=tenant,
        target_type=type(target).__name__ if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        details=details,
    )
