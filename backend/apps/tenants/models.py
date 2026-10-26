from django.core.validators import RegexValidator
from django.db import models

# Same shape as `tenantId` in libs/shared: the subdomain label (acme.soteriaforge.com).
tenant_slug = RegexValidator(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", "Invalid tenant id.")


class Tenant(models.Model):
    """A customer organization (e.g. Lakewood University). Mirrors `Tenant` in libs/shared."""

    class Status(models.TextChoices):
        PROVISIONING = "provisioning"
        ACTIVE = "active"
        SUSPENDED = "suspended"
        ARCHIVED = "archived"

    id = models.CharField(primary_key=True, max_length=63, validators=[tenant_slug])
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status, default=Status.PROVISIONING)
    plan = models.CharField(max_length=50, default="starter")
    custom_domain = models.CharField(max_length=253, blank=True, default="")
    branding = models.JSONField(default=dict, blank=True)
    # Identity Platform tenant pool. Firebase signs it into every ID token
    # (`firebase.tenant`), so it is how the API maps a token to a tenant.
    gcip_tenant_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.id})"
