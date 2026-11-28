"""Drive the real /mcp endpoint in-process with the MCP SDK client.

The app runs under `async_to_sync`, so `sync_to_async(thread_sensitive=True)`
work (token checks, tools) runs on the test thread: same database connection,
same test transaction, same RLS-bound role.
"""

import json
import secrets
from datetime import timedelta

import httpx2
from asgiref.sync import async_to_sync
from django.utils import timezone
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from oauth2_provider.models import get_access_token_model, get_application_model, set_token_value

from apps.mcp.principal import user_for
from apps.mcp.server import build_app
from forge.asgi import router

BASE = "https://testserver"


def oauth_token(member, tenant, *, scope="forge", expires_in=3600, resource=None) -> str:
    """Issue an access token for `member` acting in `tenant`, as /oauth/token would."""
    app, _ = get_application_model().objects.get_or_create(
        name="Test AI app",
        defaults={
            "client_type": "public",
            "authorization_grant_type": "authorization-code",
            "redirect_uris": "https://claude.ai/api/mcp/auth_callback",
        },
    )
    raw = secrets.token_urlsafe(32)
    token = get_access_token_model()(
        user=user_for(member, tenant),
        application=app,
        scope=scope,
        expires=timezone.now() + timedelta(seconds=expires_in),
        resource=resource or [],
    )
    set_token_value(token, raw)
    token.save()
    return raw


def _session(token: str | None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    mcp_app = build_app()
    http = httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=router(mcp_app)), base_url=BASE, headers=headers
    )
    return mcp_app, http


def call(token: str, tool: str, **arguments):
    """Call one tool; returns the CallToolResult."""

    async def go():
        mcp_app, http = _session(token)
        async with (
            mcp_app.router.lifespan_context(mcp_app),
            http,
            Client(streamable_http_client(f"{BASE}/mcp", http_client=http)) as client,
        ):
            return await client.call_tool(tool, arguments)

    return async_to_sync(go)()


def list_tools(token: str) -> list[str]:
    async def go():
        mcp_app, http = _session(token)
        async with (
            mcp_app.router.lifespan_context(mcp_app),
            http,
            Client(streamable_http_client(f"{BASE}/mcp", http_client=http)) as client,
        ):
            return [t.name for t in (await client.list_tools()).tools]

    return async_to_sync(go)()


def http_get(path: str, token: str | None = None, **headers) -> httpx2.Response:
    async def go():
        mcp_app, http = _session(token)
        async with mcp_app.router.lifespan_context(mcp_app), http:
            return await http.get(path, headers=headers)

    return async_to_sync(go)()


def http_post(path: str, token: str | None = None, **kwargs) -> httpx2.Response:
    async def go():
        mcp_app, http = _session(token)
        async with mcp_app.router.lifespan_context(mcp_app), http:
            return await http.post(path, **kwargs)

    return async_to_sync(go)()


def data(result) -> dict:
    """Structured output of a successful call (fails loudly on a tool error)."""
    assert not result.is_error, result.content
    if result.structured_content is not None:
        return result.structured_content
    return json.loads(result.content[0].text)


def error(result) -> str:
    assert result.is_error, result.structured_content
    return " ".join(getattr(c, "text", "") for c in result.content)
