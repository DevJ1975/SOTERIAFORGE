"""Firebase ID token → Forge Member.

Firebase proves identity; Postgres decides membership and role. The acting
tenant comes from the token's Identity Platform pool (`firebase.tenant`, signed
by Google). For tenants without their own pool, the client names the tenant in
`X-Forge-Tenant` (resolved from the host), and only an existing membership row
lets the request through.
"""

import logging

from django.utils.translation import gettext_lazy as _
from rest_framework import authentication, exceptions

from apps.audit.models import record
from apps.tenants import rls
from apps.tenants.models import Tenant
from forge import firebase

from . import tokens
from .models import Member

log = logging.getLogger(__name__)

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

    Anything that isn't one of our tokens returns None so the next authenticator
    (Firebase, during the migration) gets a turn. Role and tenant come from Postgres.
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


class FirebaseAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        if not header:
            return None
        scheme, _sep, token = header.partition(" ")
        if scheme != self.keyword or not token.strip():
            raise exceptions.AuthenticationFailed(
                _("Use: Authorization: Bearer <Firebase ID token>")
            )

        try:
            claims = firebase.verify_id_token(token.strip())
        except Exception as exc:  # firebase_admin raises several unrelated types
            log.info("Rejected Firebase ID token: %s", type(exc).__name__)
            raise exceptions.AuthenticationFailed(_("Invalid or expired sign-in.")) from exc

        # Membership lookup spans tenants; everything after runs tenant-scoped.
        with rls.bypass():
            member, tenant = self._resolve(claims, request.META.get(TENANT_HEADER, "").strip())
        enter_request(request, member, tenant)
        return member, claims

    def authenticate_header(self, request):
        return self.keyword

    @staticmethod
    def _resolve(claims: dict, header_tenant: str) -> tuple[Member, Tenant | None]:
        uid = claims["uid"]
        gcip_tenant = claims.get("firebase", {}).get("tenant")

        if gcip_tenant:
            tenant = Tenant.objects.filter(gcip_tenant_id=gcip_tenant).first()
            if tenant is None:
                raise exceptions.PermissionDenied(_("This sign-in pool is not linked to a tenant."))
            if header_tenant and header_tenant != tenant.id:
                raise exceptions.PermissionDenied(_("Signed in to a different tenant."))
            member = Member.objects.filter(tenant=tenant, firebase_uid=uid).first()
            if member is None:
                raise exceptions.PermissionDenied(_("Not a member of this tenant."))
            return member, tenant

        # Project-level pool: superadmins, plus tenants without their own pool.
        superadmin = Member.objects.filter(tenant__isnull=True, firebase_uid=uid).first()
        tenant = Tenant.objects.filter(pk=header_tenant).first() if header_tenant else None
        if header_tenant and tenant is None:
            raise exceptions.PermissionDenied(_("Unknown tenant."))
        if superadmin is not None:
            return superadmin, tenant
        if tenant is None:
            raise exceptions.PermissionDenied(_("Name the tenant in X-Forge-Tenant."))
        if tenant.gcip_tenant_id:
            raise exceptions.PermissionDenied(_("Sign in through this tenant's sign-in page."))
        member = Member.objects.filter(tenant=tenant, firebase_uid=uid).first()
        if member is None:
            raise exceptions.PermissionDenied(_("Not a member of this tenant."))
        return member, tenant
