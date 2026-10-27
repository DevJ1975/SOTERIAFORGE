"""Who can see which content. Every lookup is filtered by the acting tenant (RLS
enforces it again); learners see published courses only."""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied

from .models import Course, Enrollment, Lesson, PublishStatus


class Conflict(APIException):
    status_code = 409
    default_detail = "That can't be done in the lesson's current state."


def acting_tenant(request):
    if request.tenant is None:
        raise PermissionDenied("Select a tenant.")
    return request.tenant


def visible_courses(request):
    courses = Course.objects.filter(tenant=acting_tenant(request))
    if not request.user.can_author:
        courses = courses.filter(status=PublishStatus.PUBLISHED)
    return courses


def get_course(request, course_id) -> Course:
    return get_object_or_404(visible_courses(request), pk=course_id)


def get_lesson(request, lesson_id) -> Lesson:
    lessons = Lesson.objects.select_related("module__course", "quiz").filter(
        tenant=acting_tenant(request)
    )
    if not request.user.can_author:
        lessons = lessons.filter(module__course__status=PublishStatus.PUBLISHED)
    return get_object_or_404(lessons, pk=lesson_id)


def my_enrollment(request, course: Course) -> Enrollment | None:
    return Enrollment.objects.filter(course=course, member=request.user).first()


def require_enrollment(request, course: Course) -> Enrollment:
    enrollment = my_enrollment(request, course)
    if enrollment is None:
        raise PermissionDenied("Enroll in this course first.")
    return enrollment
