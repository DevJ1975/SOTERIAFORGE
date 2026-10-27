from django.urls import path

from .auth_views import (
    LoginView,
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
)
from .views import MemberListView, MemberRoleView, MeView

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/refresh", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("auth/password", PasswordChangeView.as_view(), name="auth-password"),
    path("auth/password-reset", PasswordResetRequestView.as_view(), name="auth-reset"),
    path(
        "auth/password-reset/confirm",
        PasswordResetConfirmView.as_view(),
        name="auth-reset-confirm",
    ),
    path("me", MeView.as_view(), name="me"),
    path("members", MemberListView.as_view(), name="member-list"),
    path("members/<uuid:member_id>/role", MemberRoleView.as_view(), name="member-role"),
]
