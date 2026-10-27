from django.urls import path

from . import views

urlpatterns = [
    path("me/progress", views.ScoreCardView.as_view(), name="score-card"),
    path("leaderboard/crews", views.CrewBoardView.as_view(), name="crew-board"),
    path("cohorts", views.CohortListView.as_view(), name="cohorts"),
    path("cohorts/<uuid:cohort_id>", views.CohortDetailView.as_view(), name="cohort"),
    path("cohorts/<uuid:cohort_id>/sections", views.SectionCreateView.as_view(), name="sections"),
    path("sections/<uuid:section_id>/crews", views.CrewCreateView.as_view(), name="crews"),
    path("crews/<uuid:crew_id>/members", views.CrewMembersView.as_view(), name="crew-members"),
]
