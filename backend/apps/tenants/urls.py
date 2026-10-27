from django.urls import path

from .admin_views import TenantBrandingUpdateView, TenantDetailView, TenantListView
from .views import TenantBrandingView

urlpatterns = [
    path("tenant/branding", TenantBrandingView.as_view(), name="tenant-branding"),
    path("tenants", TenantListView.as_view(), name="tenants"),
    path("tenants/<str:tenant_id>", TenantDetailView.as_view(), name="tenant"),
    path(
        "tenants/<str:tenant_id>/branding",
        TenantBrandingUpdateView.as_view(),
        name="tenant-branding-update",
    ),
]
