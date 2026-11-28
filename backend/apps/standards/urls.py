from django.urls import path

from .cmi5_views import (
    AuLaunchView,
    AuSessionView,
    FetchView,
    ScenarioView,
    StatementsView,
    StateView,
)
from .dispatch_views import (
    DispatchesView,
    DispatchPackageView,
    DispatchSessionView,
    DispatchView,
)
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
    # Packages for a tenant's own LMS (docs/scorm-cmi5.md, "Exporting to an LMS").
    path("dispatches", DispatchesView.as_view()),
    path("dispatches/<uuid:dispatch_id>", DispatchView.as_view()),
    path("dispatches/<uuid:dispatch_id>/package", DispatchPackageView.as_view()),
    path("dispatches/<uuid:dispatch_id>/session", DispatchSessionView.as_view()),
    # cmi5 / Unity lessons (docs/unity-cmi5-contract.md).
    path("lessons/<uuid:lesson_id>/cmi5/launch", AuLaunchView.as_view()),
    path("lessons/<uuid:lesson_id>/scenario", ScenarioView.as_view()),
    path("cmi5/sessions/<uuid:session_id>", AuSessionView.as_view()),
    path("cmi5/fetch/<uuid:session_id>/<str:secret>", FetchView.as_view()),
    path("xapi/statements", StatementsView.as_view()),
    path("xapi/activities/state", StateView.as_view()),
]
