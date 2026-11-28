"""Access token → Forge Member.

Django proves identity; Postgres decides membership and role. A tenant member's
tenant is their own; a superadmin (no tenant) names the tenant to act in with
`X-Forge-Tenant`.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import authentication, exceptions

from apps.audit.models import record
from apps.tenants import rls
from apps.tenants.models import Tenant

from . import tokens
from .models import Member

TENANT_HEADER = "HTTP_X_FORGE_TENANT"


def enter_request(request, member: Member, tenant: Tenant | None) -> None:
    """Scope the database session and request to the authenticated member."""
    if tenant is not None:
        rls.set_tenant(tenant.id)
    elif member.is_superadmin:
        rls.set_bypass(True)  # platform-level superadmin request
    if member.status == Member.Status.INVITED:
        # First verified sign-in accepts the invite.
        member.status = Member.Status.ACTIVE
        member.save(update_fields=["status", "updated_at"])
        record(action="member.invite.accepted", actor=member, tenant=tenant, target=member)
    request.tenant = tenant


class TokenAuthentication(authentication.BaseAuthentication):
    """Access token issued by `auth_views.LoginView` → Forge Member.

    Anything that isn't one of our tokens returns None (so the request is
    unauthenticated). Role and tenant come from Postgres.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        scheme, _sep, token = header.partition(" ")
        if scheme != self.keyword or not token.strip():
            return None
        payload = tokens.read_access(token.strip())
        if payload is None:
            return None

        with rls.bypass():
            member = Member.objects.select_related("tenant").filter(pk=payload["m"]).first()
        if member is None or not tokens.access_matches(member, payload):
            raise exceptions.AuthenticationFailed(_("Invalid or expired sign-in."))

        header_tenant = request.META.get(TENANT_HEADER, "").strip()
        if member.tenant is not None:
            if header_tenant and header_tenant != member.tenant_id:
                raise exceptions.PermissionDenied(_("Signed in to a different tenant."))
            tenant = member.tenant
        elif header_tenant:  # superadmin acting inside a tenant
            tenant = Tenant.objects.filter(pk=header_tenant).first()
            if tenant is None:
                raise exceptions.PermissionDenied(_("Unknown tenant."))
        else:
            tenant = None
        enter_request(request, member, tenant)
        return member, {"uid": str(member.id), "method": "password"}

    def authenticate_header(self, request):
        return self.keyword
