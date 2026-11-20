"""Release tools for the Forge API on Railway (platform superadmins only).

Production changes only by merging to the production branch, so "promote" opens a
release pull request for a person to merge; it never deploys code by itself. A
production redeploy (same commit, fresh container) needs `confirm=true`.
"""

from typing import Annotated, Literal

from django.conf import settings
from mcp.server.mcpserver import MCPServer
from mcp_types import ToolAnnotations
from pydantic import Field

from .. import integrations
from ..principal import Principal, off_thread, record_platform, run

READ = ToolAnnotations(read_only_hint=True, open_world_hint=True)
DEPLOY = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=True)
PROPOSE = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=True)

Environment = Literal["staging", "production"]


def _platform(what: str):
    def check(p: Principal) -> str:
        p.require_superadmin(what)
        return p.member.email

    return check


def _audit(action: str, **details):
    return lambda p: record_platform(p, action, **details)


def register(server: MCPServer) -> None:
    @server.tool(
        annotations=READ,
        description="Recent deployments of the Forge API in a Railway environment: status, branch, "
        "commit.",
    )
    async def forge_deploy_status(
        environment: Environment = "staging",
        limit: Annotated[int, Field(ge=1, le=20)] = 5,
    ) -> dict:
        await run(_platform("see deployments"))
        deployments = await off_thread(integrations.railway_deployments, environment, limit)
        return {"environment": environment, "deployments": deployments}

    @server.tool(
        annotations=READ,
        description="Build or runtime logs of a deployment (default: the latest one in the "
        "environment).",
    )
    async def forge_deploy_logs(
        environment: Environment = "staging",
        deployment_id: str | None = None,
        kind: Literal["build", "runtime"] = "runtime",
        limit: Annotated[int, Field(ge=1, le=500)] = 100,
    ) -> dict:
        await run(_platform("read deployment logs"))
        if deployment_id is None:
            latest = await off_thread(integrations.railway_deployments, environment, 1)
            if not latest:
                return {"environment": environment, "lines": []}
            deployment_id = latest[0]["id"]
        lines = await off_thread(
            integrations.railway_logs, deployment_id, build=kind == "build", limit=limit
        )
        return {"deploymentId": deployment_id, "kind": kind, "lines": lines}

    @server.tool(
        annotations=DEPLOY,
        description="Redeploy the Forge API's current commit in an environment (restarts it, runs "
        "migrations). Production requires confirm=true; ask the user first.",
    )
    async def forge_redeploy(environment: Environment = "staging", confirm: bool = False) -> dict:
        if environment == "production" and not confirm:
            return {
                "done": False,
                "message": "Production redeploy not started. Ask the user, then call again with "
                "confirm=true.",
            }
        await run(_platform("redeploy"))
        await off_thread(integrations.railway_redeploy, environment)
        await run(_audit("release.redeploy", environment=environment))
        return {
            "done": True,
            "environment": environment,
            "next": "Check forge_deploy_status in a few minutes.",
        }

    @server.tool(
        annotations=PROPOSE,
        description="Propose a production release: opens a pull request from the staging branch to "
        "the "
        "production branch. A person reviews and merges it; Railway then deploys production.",
    )
    async def forge_open_release_pr(
        title: Annotated[str, Field(min_length=1, max_length=200)],
        notes: Annotated[str, Field(max_length=10000, description="What's in this release.")] = "",
    ) -> dict:
        email = await run(_platform("propose a release"))
        body = (
            f"{notes}\n\n---\nRelease proposed by {email} through the Soteria Forge MCP server. "
            "Review the diff and CI before merging."
        )
        pr = await off_thread(
            integrations.github,
            "POST",
            "/pulls",
            json={
                "title": title,
                "head": settings.FORGE_STAGING_BRANCH,
                "base": settings.FORGE_PRODUCTION_BRANCH,
                "body": body.strip(),
            },
        )
        await run(_audit("release.pr.open", pr=pr["number"]))
        return {"number": pr["number"], "url": pr["html_url"]}
