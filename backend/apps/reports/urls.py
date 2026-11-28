from django.urls import path

from .views import (
    AtRiskView,
    CohortAnalyticsView,
    EnrollmentReportView,
    PlatformAnalyticsView,
)

urlpatterns = [
    path("reports/enrollments", EnrollmentReportView.as_view(), name="report-enrollments"),
    path("reports/analytics", CohortAnalyticsView.as_view(), name="report-analytics"),
    path("reports/at-risk", AtRiskView.as_view(), name="report-at-risk"),
    path("platform/analytics", PlatformAnalyticsView.as_view(), name="platform-analytics"),
]
