from django.urls import path

from .views import ClassroomJoinView, ClassroomListView

urlpatterns = [
    path("classrooms", ClassroomListView.as_view(), name="classrooms"),
    path("classrooms/<uuid:classroom_id>/join", ClassroomJoinView.as_view(), name="classroom-join"),
]
