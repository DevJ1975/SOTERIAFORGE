from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.accounts.views import healthz

urlpatterns = [
    path("healthz", healthz),
    path("admin/", admin.site.urls),
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
]
