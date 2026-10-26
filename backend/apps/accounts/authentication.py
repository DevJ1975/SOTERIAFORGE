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
from apps.tenants.models import Tenant
from forge import firebase

from .models import Member

log = logging.getLogger(__name__)

TENANT_HEADER = "HTTP_X_FORGE_TENANT"


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

        member, tenant = self._resolve(claims, request.META.get(TENANT_HEADER, "").strip())
        if member.status == Member.Status.INVITED:
            # First verified sign-in accepts the invite.
            member.status = Member.Status.ACTIVE
            member.save(update_fields=["status", "updated_at"])
            record(action="member.invite.accepted", actor=member, tenant=tenant, target=member)
        request.tenant = tenant
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
