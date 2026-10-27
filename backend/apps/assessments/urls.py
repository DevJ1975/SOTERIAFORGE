from django.urls import path

from . import views

urlpatterns = [
    path("quizzes", views.QuizListView.as_view(), name="quizzes"),
    path("quizzes/<uuid:quiz_id>", views.QuizDetailView.as_view(), name="quiz"),
    path("lessons/<uuid:lesson_id>/check", views.LessonCheckView.as_view(), name="lesson-check"),
    path(
        "lessons/<uuid:lesson_id>/attempts",
        views.LessonAttemptView.as_view(),
        name="lesson-attempts",
    ),
]
