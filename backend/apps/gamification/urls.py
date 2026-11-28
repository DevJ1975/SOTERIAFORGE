from django.urls import path

from . import credential_views, views

urlpatterns = [
    path("me/progress", views.ScoreCardView.as_view(), name="score-card"),
    path("leaderboard/crews", views.CrewBoardView.as_view(), name="crew-board"),
    path("me/badges", views.MyBadgesView.as_view(), name="my-badges"),
    path(
        "me/badges/<uuid:badge_id>/credential",
        credential_views.MyCredentialView.as_view(),
        name="my-credential",
    ),
    path("credentials/jwks", credential_views.JwksView.as_view(), name="credential-jwks"),
    path("credentials/verify", credential_views.VerifyView.as_view(), name="credential-verify"),
    path(
        "credentials/issuers/<str:tenant_id>",
        credential_views.IssuerView.as_view(),
        name="credential-issuer",
    ),
    path(
        "credentials/achievements/<uuid:badge_id>",
        credential_views.AchievementView.as_view(),
        name="credential-achievement",
    ),
    path(
        "credentials/<uuid:award_id>",
        credential_views.CredentialView.as_view(),
        name="credential",
    ),
    path("badges", views.BadgeListView.as_view(), name="badges"),
    path("badges/<uuid:badge_id>", views.BadgeDetailView.as_view(), name="badge"),
    path("badges/<uuid:badge_id>/award", views.BadgeSignOffView.as_view(), name="badge-award"),
    path("cohorts", views.CohortListView.as_view(), name="cohorts"),
    path("cohorts/<uuid:cohort_id>", views.CohortDetailView.as_view(), name="cohort"),
    path("cohorts/<uuid:cohort_id>/sections", views.SectionCreateView.as_view(), name="sections"),
    path("sections/<uuid:section_id>/crews", views.CrewCreateView.as_view(), name="crews"),
    path("crews/<uuid:crew_id>/members", views.CrewMembersView.as_view(), name="crew-members"),
]
