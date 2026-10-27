from django.urls import path

from .views import AssetContentView, AssetListView, AssetUrlView

urlpatterns = [
    path("assets", AssetListView.as_view(), name="assets"),
    path("assets/<uuid:asset_id>/url", AssetUrlView.as_view(), name="asset-url"),
    path("assets/<uuid:asset_id>/content", AssetContentView.as_view(), name="asset-content"),
]
