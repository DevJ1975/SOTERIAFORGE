from django.urls import path

from .views import AskView, CoursesView, ProfilesView, SourcesView, SourceView

urlpatterns = [
    path("profiles", ProfilesView.as_view()),
    path("courses", CoursesView.as_view()),
    path("sources", SourcesView.as_view()),
    path("sources/<uuid:source_id>", SourceView.as_view()),
    path("ask", AskView.as_view()),
]
