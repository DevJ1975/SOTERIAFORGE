from django.urls import path

from .views import EnrollmentReportView, PlatformAnalyticsView

urlpatterns = [
    path("reports/enrollments", EnrollmentReportView.as_view(), name="report-enrollments"),
    path("platform/analytics", PlatformAnalyticsView.as_view(), name="platform-analytics"),
]
