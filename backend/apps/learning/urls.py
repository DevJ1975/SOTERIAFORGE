from django.urls import path

from . import views

urlpatterns = [
    path("courses", views.CourseListView.as_view(), name="courses"),
    path("courses/<uuid:course_id>", views.CourseDetailView.as_view(), name="course"),
    path("courses/<uuid:course_id>/modules", views.ModuleCreateView.as_view(), name="modules"),
    path("courses/<uuid:course_id>/enroll", views.EnrollView.as_view(), name="course-enroll"),
    path("courses/<uuid:course_id>/assign", views.AssignView.as_view(), name="course-assign"),
    path("modules/<uuid:module_id>", views.ModuleDetailView.as_view(), name="module"),
    path("modules/<uuid:module_id>/lessons", views.LessonCreateView.as_view(), name="lessons"),
    path("lessons/<uuid:lesson_id>", views.LessonDetailView.as_view(), name="lesson"),
    path(
        "lessons/<uuid:lesson_id>/complete",
        views.LessonCompleteView.as_view(),
        name="lesson-complete",
    ),
    path(
        "lessons/<uuid:lesson_id>/runtime", views.LessonRuntimeView.as_view(), name="lesson-runtime"
    ),
    path("enrollments/me", views.MyEnrollmentsView.as_view(), name="my-enrollments"),
]
