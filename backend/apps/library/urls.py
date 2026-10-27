from django.urls import path

from .views import LibraryCourseListView, LibraryShareView

urlpatterns = [
    path("library/courses", LibraryCourseListView.as_view(), name="library-courses"),
    path(
        "library/courses/<uuid:course_id>/share",
        LibraryShareView.as_view(),
        name="library-share",
    ),
]
