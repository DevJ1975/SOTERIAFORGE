from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.accounts.views import healthz
from apps.gamification.verify_page import credential_page

urlpatterns = [
    path("healthz", healthz),
    path("admin/", admin.site.urls),
    # Public, human-readable check for a badge credential (docs/open-badges.md).
    path("credentials/<uuid:award_id>", credential_page, name="credential-page"),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.tenants.urls")),
    path("api/engage/", include("apps.engage.urls")),
    path("api/", include("apps.learning.urls")),
    path("api/", include("apps.assessments.urls")),
    path("api/", include("apps.gamification.urls")),
    path("api/", include("apps.games.urls")),
    path("api/", include("apps.reports.urls")),
    path("api/", include("apps.library.urls")),
    path("api/", include("apps.assets.urls")),
    path("api/coach/", include("apps.coach.urls")),
    path("api/standards/", include("apps.standards.urls")),
    # OAuth 2.1 for the MCP endpoint; /mcp itself is routed in forge/asgi.py.
    path("", include("apps.mcp.urls")),
]
