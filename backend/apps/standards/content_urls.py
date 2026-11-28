from django.urls import path

from apps.accounts.views import healthz

from .content import asset, player, runtime_script

urlpatterns = [
    path("healthz", healthz),
    path("runtime.js", runtime_script),
    path("launch/<str:token>/", player),
    path("launch/<str:token>/files/<path:name>", asset),
]
