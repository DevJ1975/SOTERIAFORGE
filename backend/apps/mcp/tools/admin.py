"""Organization tools for tenant admins: settings, members and the audit log (read-only).

Inviting, deactivating and changing roles stay in the admin app, where the invite
email and session revocation are handled.
"""

from typing import Annotated, Literal

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry
from apps.tenants.models import Tenant

from ..principal import ADMIN_ROLES, Principal, run
from .common import READ

TenantRole = Literal[tuple(r for r in Role.values if r != Role.SUPERADMIN)]  # type: ignore[valid-type]


def _admin(p: Principal) -> Tenant:
    return p.require_role(ADMIN_ROLES, "administer this organization")


def register(server: MCPServer) -> None:
    @server.tool(annotations=READ, description="Your organization's settings and branding.")
    async def forge_get_organization() -> dict:
        def go(p: Principal):
            t = _admin(p)
            return {
                "id": t.id,
                "name": t.name,
                "status": t.status,
                "plan": t.plan,
                "customDomain": t.custom_domain,
                "branding": t.branding,
                "memberCount": Member.objects.filter(tenant=t).count(),
            }

        return await run(go)

    @server.tool(annotations=READ, description="Members of your organization, optionally filtered.")
    async def forge_list_members(
        role: TenantRole | None = None,
        status: Literal["invited", "active", "deactivated"] | None = None,
        search: Annotated[str, Field(max_length=100)] = "",
    ) -> dict:
        def go(p: Principal):
            members = Member.objects.filter(tenant=_admin(p))
            if role:
                members = members.filter(role=role)
            if status:
                members = members.filter(status=status)
            if search:
                members = members.filter(email__icontains=search) | members.filter(
                    display_name__icontains=search
                )
            return {
                "members": [
                    {
                        "id": str(m.id),
                        "email": m.email,
                        "displayName": m.display_name,
                        "role": m.role,
                        "status": m.status,
                    }
                    for m in members[:500]
                ]
            }

        return await run(go)

    @server.tool(annotations=READ, description="Recent audit log entries for your organization.")
    async def forge_audit_log(
        action_prefix: Annotated[
            str, Field(max_length=100, description='e.g. "member." or "learning."')
        ] = "",
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict:
        def go(p: Principal):
            entries = AuditEntry.objects.filter(tenant=_admin(p)).select_related("actor")
            if action_prefix:
                entries = entries.filter(action__startswith=action_prefix)
            return {
                "entries": [
                    {
                        "at": e.created_at.isoformat(),
                        "action": e.action,
                        "actor": e.actor.email if e.actor else None,
                        "target": f"{e.target_type}:{e.target_id}" if e.target_type else None,
                        "details": e.details,
                    }
                    for e in entries[:limit]
                ]
            }

        return await run(go)
