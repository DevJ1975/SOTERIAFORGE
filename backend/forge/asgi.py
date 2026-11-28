import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "forge.settings")
django_app = get_asgi_application()

from apps.mcp.server import build_app  # noqa: E402  (needs Django set up)

MCP_PATHS = ("/mcp", "/mcp/")
MCP_PREFIXES = ("/.well-known/oauth-protected-resource",)


def router(mcp_app):
    """Django serves everything except the MCP endpoint and its resource metadata.

    Lifespan events go to the MCP app (its session manager runs there); Django's
    ASGI handler doesn't take them.
    """

    async def application(scope, receive, send):
        if scope["type"] == "lifespan":
            return await mcp_app(scope, receive, send)
        path = scope.get("path", "")
        if path in MCP_PATHS or path.startswith(MCP_PREFIXES):
            return await mcp_app(scope, receive, send)
        return await django_app(scope, receive, send)

    return application


application = router(build_app())
