import uuid

from django.db import models
from django.db.models import Q

from apps.tenants.models import Tenant


class Role(models.TextChoices):
    """Keep aligned with ROLES in libs/shared/src/lib/constants.ts."""

    SUPERADMIN = "superadmin"
    TENANT_ADMIN = "tenant_admin"
    INSTRUCTOR = "instructor"
    LEARNER = "learner"
    B2C_CUSTOMER = "b2c_customer"


AUTHORING_ROLES = frozenset({Role.SUPERADMIN, Role.TENANT_ADMIN, Role.INSTRUCTOR})


class Member(models.Model):
    """A Firebase identity's membership in one tenant, and its role there.

    Postgres is the source of truth for roles (plan §2); Firebase only proves who
    the user is. Superadmins belong to no tenant and sign in to the project-level
    Firebase pool.
    """

    class Status(models.TextChoices):
        INVITED = "invited"
        ACTIVE = "active"
        DEACTIVATED = "deactivated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.PROTECT, null=True, blank=True, related_name="members"
    )
    firebase_uid = models.CharField(max_length=128)
    email = models.EmailField()
    display_name = models.CharField(max_length=200, blank=True, default="")
    role = models.CharField(max_length=20, choices=Role, default=Role.LEARNER)
    status = models.CharField(max_length=20, choices=Status, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_name", "email"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "firebase_uid"], name="member_unique_per_tenant"
            ),
            models.UniqueConstraint(
                fields=["firebase_uid"],
                condition=Q(tenant__isnull=True),
                name="superadmin_unique_uid",
            ),
            # Superadmins have no tenant; every other role has exactly one.
            models.CheckConstraint(
                condition=Q(role=Role.SUPERADMIN, tenant__isnull=True)
                | (~Q(role=Role.SUPERADMIN) & Q(tenant__isnull=False)),
                name="member_role_matches_tenant_scope",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.email} ({self.role}@{self.tenant_id or 'platform'})"

    # DRF calls these on request.user.
    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    @property
    def is_superadmin(self) -> bool:
        return self.role == Role.SUPERADMIN

    @property
    def can_author(self) -> bool:
        return self.role in AUTHORING_ROLES
