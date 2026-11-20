"""Who may register an OAuth client (RFC 7591 dynamic client registration).

Registration is unauthenticated by nature, so the redirect URIs are the gate:
tokens can only ever be delivered to the AI apps we list (Claude, ChatGPT) or to a
loopback address on the user's own machine (Claude Code/Desktop, MCP Inspector).
"""

import json
from urllib.parse import urlparse

from django.conf import settings

LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Tokens must act for a signed-in person, so only the authorization-code grant.
ALLOWED_GRANTS = {"authorization_code", "refresh_token"}


def redirect_allowed(uri: str) -> bool:
    parsed = urlparse(uri)
    host = (parsed.hostname or "").lower()
    if parsed.scheme == "http":
        return host in LOOPBACK_HOSTS
    return parsed.scheme == "https" and host in settings.MCP_REDIRECT_HOSTS


class AllowlistedRedirectsDCRPermission:
    def has_permission(self, request) -> bool:
        try:
            metadata = json.loads(request.body or b"{}")
            uris = metadata.get("redirect_uris") or []
            grants = set(metadata.get("grant_types") or ["authorization_code"])
        except (ValueError, AttributeError, TypeError):
            return False
        return (
            bool(uris)
            and grants <= ALLOWED_GRANTS
            and all(isinstance(u, str) and redirect_allowed(u) for u in uris)
        )
