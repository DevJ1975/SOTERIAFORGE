import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.tenants.models import Tenant


class Role(models.TextChoices):
    """Keep aligned with ROLES in libs/shared/src/lib/constants.ts."""

    SUPERADMIN = "superadmin"
    TENANT_ADMIN = "tenant_admin"
    INSTRUCTOR = "instructor"
    LEARNER = "learner"
    B2C_CUSTOMER = "b2c_customer"


# Roles staff may give; superadmin is granted only by `manage.py grant_superadmin`.
ASSIGNABLE_ROLES = [r for r in Role.values if r != Role.SUPERADMIN]


AUTHORING_ROLES = frozenset({Role.SUPERADMIN, Role.TENANT_ADMIN, Role.INSTRUCTOR})


class Member(models.Model):
    """A person's membership in one tenant, and their role there.

    Postgres is the source of truth for roles (plan §2). Members sign in with an
    email and password that Django verifies (see `auth_views`). Superadmins belong to no tenant.
    """

    class Status(models.TextChoices):
        INVITED = "invited"
        ACTIVE = "active"
        DEACTIVATED = "deactivated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.PROTECT, null=True, blank=True, related_name="members"
    )
    email = models.EmailField()
    # Django password hash. Empty means no password yet (invited).
    password = models.CharField(max_length=128, blank=True, default="")
    # Consecutive wrong passwords; kept in Postgres because serverless instances
    # can't share an in-memory throttle.
    failed_logins = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    display_name = models.CharField(max_length=200, blank=True, default="")
    role = models.CharField(max_length=20, choices=Role, default=Role.LEARNER)
    status = models.CharField(max_length=20, choices=Status, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_name", "email"]
        constraints = [
            # One account per email per tenant (and one platform-level per email).
            models.UniqueConstraint(
                Lower("email"),
                "tenant",
                condition=Q(tenant__isnull=False),
                name="member_email_unique_per_tenant",
            ),
            models.UniqueConstraint(
                Lower("email"),
                condition=Q(tenant__isnull=True),
                name="superadmin_email_unique",
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

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def set_password(self, raw: str) -> None:
        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return bool(self.password) and check_password(raw, self.password)

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


class RefreshToken(models.Model):
    """One refresh token. Rotated on every use; reuse of a spent token revokes its family."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="refresh_tokens")
    # All tokens descended from one sign-in share a family, so a stolen-and-replayed
    # token can end the whole chain.
    family = models.UUIDField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 of the secret
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"refresh {self.family} for {self.member_id}"


class OneTimeToken(models.Model):
    """Emailed single-use link: password reset, or an invited member setting a password."""

    class Purpose(models.TextChoices):
        RESET = "reset"
        INVITE = "invite"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="one_time_tokens")
    purpose = models.CharField(max_length=10, choices=Purpose)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.purpose} link for {self.member_id}"
