from django.urls import path

from .views import MemberListView, MemberRoleView, MeView

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("members", MemberListView.as_view(), name="member-list"),
    path("members/<uuid:member_id>/role", MemberRoleView.as_view(), name="member-role"),
]
