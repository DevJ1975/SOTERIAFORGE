"""OAuth 2.1 authorization server for the Forge MCP endpoint (django-oauth-toolkit).

Only what MCP clients use is mounted: RFC 8414 metadata at the root, authorize
(with PKCE), token, revocation and dynamic client registration. The protected
resource metadata (RFC 9728) is served by the MCP app itself (forge/asgi.py).
"""

from django.urls import include, path
from oauth2_provider import views as dot_views
from oauth2_provider.urls import dcr_urlpatterns, metadata_urlpatterns

from .login import login_view
from .views import ForgeAuthorizationView, logout_view

oauth_patterns = [
    path("authorize/", ForgeAuthorizationView.as_view(), name="authorize"),
    path("token/", dot_views.TokenView.as_view(), name="token"),
    path("revoke_token/", dot_views.RevokeTokenView.as_view(), name="revoke-token"),
    *dcr_urlpatterns,
]
server_metadata = [p for p in metadata_urlpatterns if p.name.startswith("oauth-server-metadata")]

urlpatterns = [
    path("oauth/login/", login_view, name="mcp-login"),
    path("oauth/logout/", logout_view, name="mcp-logout"),
    path(
        "",
        include(([*server_metadata, path("oauth/", include(oauth_patterns))], "oauth2_provider")),
    ),
]
