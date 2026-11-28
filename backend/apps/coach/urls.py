from django.urls import path

from .views import (
    AskStreamView,
    AskView,
    CoursesView,
    ProfilesView,
    RatingView,
    ReviewItemView,
    ReviewQueueView,
    SourcesView,
    SourceView,
)

urlpatterns = [
    path("profiles", ProfilesView.as_view()),
    path("courses", CoursesView.as_view()),
    path("sources", SourcesView.as_view()),
    path("sources/<uuid:source_id>", SourceView.as_view()),
    path("ask", AskView.as_view()),
    path("ask/stream", AskStreamView.as_view()),
    path("exchanges/<uuid:exchange_id>/rating", RatingView.as_view()),
    path("review", ReviewQueueView.as_view()),
    path("review/<uuid:exchange_id>", ReviewItemView.as_view()),
]
