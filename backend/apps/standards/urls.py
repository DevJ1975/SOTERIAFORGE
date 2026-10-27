from django.urls import path

from .views import (
    AttachView,
    CommitView,
    ConfigurationView,
    DeliveryView,
    LaunchView,
    PackagesView,
    PackageView,
)

urlpatterns = [
    path("configuration", ConfigurationView.as_view()),
    path("packages", PackagesView.as_view()),
    path("packages/<uuid:package_id>", PackageView.as_view()),
    path("packages/<uuid:package_id>/attach", AttachView.as_view()),
    path("lessons/<uuid:lesson_id>/launch", LaunchView.as_view()),
    path("launches/<uuid:launch_id>/commit", CommitView.as_view()),
    path("deliveries", DeliveryView.as_view()),
]
