from rest_framework.permissions import BasePermission

from apps.tenants.models import Tenant

from .models import Member, Role


def _member(request) -> Member | None:
    user = getattr(request, "user", None)
    return user if isinstance(user, Member) else None


class IsActiveMember(BasePermission):
    """Default for every API view: a signed-in, active member of an active tenant."""

    message = "Sign in with an active Forge account."

    def has_permission(self, request, view) -> bool:
        member = _member(request)
        if member is None or not member.is_active:
            return False
        if member.is_superadmin:
            return True
        tenant = getattr(request, "tenant", None)
        return tenant is not None and tenant.status == Tenant.Status.ACTIVE


class HasTenantRole(BasePermission):
    """Requires an acting tenant and one of `view.tenant_roles` there (superadmins pass)."""

    message = "Your role can't do this in this tenant."

    def has_permission(self, request, view) -> bool:
        member = _member(request)
        if member is None or getattr(request, "tenant", None) is None:
            return False
        roles = getattr(view, "tenant_roles", ())
        return member.is_superadmin or member.role in roles


TENANT_STAFF = (Role.TENANT_ADMIN, Role.INSTRUCTOR)
