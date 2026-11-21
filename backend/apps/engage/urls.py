from django.urls import path

from . import views

urlpatterns = [
    path("classrooms", views.ClassroomListView.as_view(), name="classrooms"),
    path(
        "classrooms/<uuid:classroom_id>/join",
        views.ClassroomJoinView.as_view(),
        name="classroom-join",
    ),
    path("classrooms/<uuid:classroom_id>/sessions", views.SessionStartView.as_view()),
    path("sessions/<uuid:session_id>/state", views.SessionStateView.as_view()),
    path("sessions/<uuid:session_id>/advance", views.SessionAdvanceView.as_view()),
    path("sessions/<uuid:session_id>/end", views.SessionEndView.as_view()),
    path("sessions/<uuid:session_id>/activities", views.ActivityCreateView.as_view()),
    path("sessions/<uuid:session_id>/heartbeat", views.HeartbeatView.as_view()),
    path("sessions/<uuid:session_id>/huddle", views.HuddleView.as_view()),
    path("sessions/<uuid:session_id>/hand", views.HandView.as_view()),
    path("sessions/<uuid:session_id>/attendance", views.AttendanceView.as_view()),
    path("sessions/<uuid:session_id>/heatmap", views.HeatmapView.as_view()),
    path(
        "sessions/<uuid:session_id>/participants/<uuid:member_id>/moderate",
        views.ModerateView.as_view(),
    ),
    path("activities/<uuid:activity_id>/respond", views.RespondView.as_view()),
    path("activities/<uuid:activity_id>/close", views.ActivityCloseView.as_view()),
]
