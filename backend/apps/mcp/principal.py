"""Who an MCP tool call runs as, and the scope it runs in.

An OAuth grant binds one Forge membership in one acting tenant. django-oauth-toolkit
needs a Django `User` as the resource owner, so each (member, tenant) pair gets a
shadow user named `mcp:<member id>:<tenant id>`; it has no password and no staff
rights. Every call re-reads the member and tenant, so a role change, deactivation
or suspended tenant takes effect on the next call, not when the token expires.
"""

import hashlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import close_old_connections, connection, transaction
from django.http import Http404
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver.exceptions import ToolError
from oauth2_provider.models import get_access_token_model
from rest_framework.exceptions import APIException

from apps.accounts.models import Member, Role
from apps.audit.models import record
from apps.tenants import rls
from apps.tenants.models import Tenant

USERNAME_PREFIX = "mcp:"


@dataclass(frozen=True)
class Principal:
    member: Member
    tenant: Tenant | None
    client_id: str

    def require_tenant(self) -> Tenant:
        if self.tenant is None:
            raise PermissionDenied("Reconnect and sign in with an organization to work inside one.")
        return self.tenant

    def require_role(self, roles: Iterable[str], what: str) -> Tenant:
        """The acting tenant, if the member may do `what` there (superadmins may)."""
        tenant = self.require_tenant()
        if not (self.member.is_superadmin or self.member.role in set(roles)):
            raise PermissionDenied(f"Your role ({self.member.role}) can't {what}.")
        return tenant

    def require_superadmin(self, what: str) -> None:
        if not self.member.is_superadmin:
            raise PermissionDenied(f"Only Soteria Forge platform admins can {what}.")


def record_platform(p: Principal, action: str, **details) -> None:
    """Audit a platform action (release, code) with no tenant, even if signed in to one."""
    with rls.bypass():
        record(action=action, actor=p.member, **details)


def username_for(member: Member, tenant: Tenant | None) -> str:
    return f"{USERNAME_PREFIX}{member.pk}:{tenant.pk if tenant else ''}"


def user_for(member: Member, tenant: Tenant | None):
    user, created = get_user_model().objects.get_or_create(username=username_for(member, tenant))
    if created:
        user.email = member.email
        user.set_unusable_password()
        user.save()
    return user


def resolve(username: str) -> tuple[Member, Tenant | None] | None:
    """The (member, acting tenant) behind an OAuth user, if it may still act. Needs RLS bypass."""
    if not username.startswith(USERNAME_PREFIX):
        return None
    member_id, _sep, tenant_id = username.removeprefix(USERNAME_PREFIX).partition(":")
    member = Member.objects.select_related("tenant").filter(pk=member_id).first()
    if member is None or not member.is_active:
        return None
    if not tenant_id:
        return (member, None) if member.is_superadmin else None
    if not member.is_superadmin and member.tenant_id != tenant_id:
        return None
    tenant = (
        member.tenant
        if member.tenant_id == tenant_id
        else Tenant.objects.filter(pk=tenant_id).first()
    )
    if tenant is None or tenant.status != Tenant.Status.ACTIVE:
        return None
    return member, tenant


def lookup_token(raw: str):
    """The live django-oauth-toolkit access token for `raw`, or None (tokens are hashed at rest)."""
    checksum = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    token = (
        get_access_token_model()
        .objects.select_related("user", "application")
        .filter(token_checksum=checksum)
        .first()
    )
    if token is None or token.is_expired() or token.user is None:
        return None
    return token


async def run(fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> Any:
    """Run `fn(principal, *args, **kwargs)` as the signed-in caller, in one transaction."""
    token = get_access_token()
    if token is None or not token.subject:
        raise ToolError("Sign in to Soteria Forge to use this tool.")
    return await sync_to_async(_run, thread_sensitive=True)(
        token.subject, token.client_id, fn, args, kwargs
    )


async def off_thread(fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> Any:
    """Run slow network I/O (GitHub, Railway) off Django's shared sync thread."""
    try:
        return await sync_to_async(fn, thread_sensitive=False)(*args, **kwargs)
    except ValidationError as exc:
        raise ToolError("; ".join(exc.messages)) from None


def _run(subject: str, client_id: str, fn, args, kwargs):
    # Same connection hygiene as a Django request (skipped inside a test transaction).
    fresh = not connection.in_atomic_block
    if fresh:
        close_old_connections()
    try:
        with rls.request_scope():
            with rls.bypass():
                resolved = resolve(subject)
            if resolved is None:
                raise ToolError("Your Soteria Forge access has ended. Reconnect to sign in again.")
            member, tenant = resolved
            if tenant is not None:
                rls.set_tenant(tenant.pk)
            else:
                rls.set_bypass(True)  # platform-level superadmin, as in TokenAuthentication
            try:
                with transaction.atomic():
                    return fn(Principal(member, tenant, client_id), *args, **kwargs)
            except ValidationError as exc:
                raise ToolError("; ".join(exc.messages)) from None
            except PermissionDenied as exc:
                raise ToolError(str(exc) or "Not allowed.") from None
            except APIException as exc:  # serializer and view-layer rules reused by tools
                raise ToolError(_flatten(exc.detail)) from None
            except Http404:
                raise ToolError("Nothing with that id in your organization.") from None
    finally:
        if fresh:
            close_old_connections()


def _flatten(detail, prefix: str = "") -> str:
    """A DRF error detail as one readable line: `field: message; other: message`."""
    if isinstance(detail, dict):
        return "; ".join(
            _flatten(value, f"{prefix}{key}: " if key != "non_field_errors" else prefix)
            for key, value in detail.items()
        )
    if isinstance(detail, list | tuple):
        return "; ".join(
            _flatten(value, f"{prefix}[{i}] " if isinstance(value, dict | list) else prefix)
            for i, value in enumerate(detail)
            if value
        )
    return f"{prefix}{detail}"


STAFF_ROLES = (Role.TENANT_ADMIN, Role.INSTRUCTOR)
ADMIN_ROLES = (Role.TENANT_ADMIN,)
