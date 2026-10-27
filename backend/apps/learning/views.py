from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Member
from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.assessments.grading import MalformedQuiz, parse_questions, public_question
from apps.assessments.models import CheckAnswer, Quiz
from apps.audit.models import record

from .access import (
    Conflict,
    acting_tenant,
    get_course,
    get_lesson,
    my_enrollment,
    require_enrollment,
    visible_courses,
)
from .models import Enrollment, Lesson, LessonProgress, Module, PublishStatus
from .progress import complete_lesson, touch
from .serializers import (
    AssignResultSerializer,
    AssignSerializer,
    CompleteSerializer,
    CompletionSerializer,
    CourseOutlineSerializer,
    CourseSerializer,
    EnrollmentSerializer,
    LessonDetailSerializer,
    LessonWriteSerializer,
    ModuleSerializer,
    MyEnrollmentSerializer,
    RuntimeSerializer,
    lesson_summary,
)


class AuthorWrites:
    """Reads for any active member; writes for tenant staff (and superadmins)."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsActiveMember()]
        return super().get_permissions()


def completed_lesson_ids(enrollment: Enrollment | None) -> set:
    if enrollment is None:
        return set()
    return set(
        LessonProgress.objects.filter(
            enrollment=enrollment, completed_at__isnull=False
        ).values_list("lesson_id", flat=True)
    )


def outline(course, enrollment: Enrollment | None) -> dict:
    done = completed_lesson_ids(enrollment)
    modules = course.modules.prefetch_related(
        Prefetch("lessons", queryset=Lesson.objects.order_by("order", "created_at"))
    )
    return {
        **CourseSerializer(course).data,
        "modules": [
            {
                **ModuleSerializer(m).data,
                "lessons": [lesson_summary(lesson, done) for lesson in m.lessons.all()],
            }
            for m in modules
        ],
        "enrollment": EnrollmentSerializer(enrollment).data if enrollment else None,
    }


class CourseListView(AuthorWrites, APIView):
    @extend_schema(responses=CourseSerializer(many=True))
    def get(self, request):
        return Response(CourseSerializer(visible_courses(request), many=True).data)

    @extend_schema(request=CourseSerializer, responses={201: CourseSerializer})
    def post(self, request):
        body = CourseSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            course = body.save(tenant=acting_tenant(request), created_by=request.user)
            record(
                action="learning.course.created",
                actor=request.user,
                tenant=request.tenant,
                target=course,
            )
        return Response(CourseSerializer(course).data, status=201)


class CourseDetailView(AuthorWrites, APIView):
    @extend_schema(responses=CourseOutlineSerializer)
    def get(self, request, course_id):
        course = get_course(request, course_id)
        return Response(outline(course, my_enrollment(request, course)))

    @extend_schema(request=CourseSerializer, responses=CourseSerializer)
    def patch(self, request, course_id):
        course = get_course(request, course_id)
        old_status = course.status
        body = CourseSerializer(course, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            course = body.save()
            if course.status != old_status:
                record(
                    action="learning.course.status",
                    actor=request.user,
                    tenant=request.tenant,
                    target=course,
                    old=old_status,
                    new=course.status,
                )
        return Response(CourseSerializer(course).data)


class ModuleCreateView(AuthorWrites, APIView):
    @extend_schema(request=ModuleSerializer, responses={201: ModuleSerializer})
    def post(self, request, course_id):
        course = get_course(request, course_id)
        body = ModuleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        module = body.save(tenant=course.tenant, course=course)
        return Response(ModuleSerializer(module).data, status=201)


class ModuleDetailView(AuthorWrites, APIView):
    @extend_schema(request=ModuleSerializer, responses=ModuleSerializer)
    def patch(self, request, module_id):
        module = get_object_or_404(Module, tenant=acting_tenant(request), pk=module_id)
        body = ModuleSerializer(module, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        return Response(ModuleSerializer(body.save()).data)


def resolve_quiz(request, data: dict) -> dict:
    """Swap `quizId` for the acting tenant's quiz (404-like 400 if it isn't theirs)."""
    if "quizId" not in data:
        return data
    quiz_id = data.pop("quizId")
    if quiz_id is None:
        data["quiz"] = None
        return data
    quiz = Quiz.objects.filter(tenant=acting_tenant(request), pk=quiz_id).first()
    if quiz is None:
        raise ValidationError({"quizId": ["No such quiz."]})
    data["quiz"] = quiz
    return data


def lesson_detail(lesson: Lesson, enrollment: Enrollment | None) -> dict:
    progress = (
        LessonProgress.objects.filter(enrollment=enrollment, lesson=lesson).first()
        if enrollment
        else None
    )
    quiz = None
    if lesson.quiz is not None:
        answers = (
            CheckAnswer.objects.filter(enrollment=enrollment, lesson=lesson) if enrollment else []
        )
        try:
            questions = [public_question(q) for q in parse_questions(lesson.quiz.questions)]
        except MalformedQuiz:
            questions = []  # grading refuses it too; authors see the problem on save
        quiz = {
            "id": str(lesson.quiz.pk),
            "title": lesson.quiz.title,
            "mode": "graded" if lesson.content_type == "quiz" else "check",
            "passThreshold": lesson.quiz.pass_threshold,
            "maxAttempts": lesson.quiz.max_attempts,
            "questions": questions,
            "answered": {
                a.question_id: {"firstCorrect": a.first_correct, "solved": a.solved_at is not None}
                for a in answers
            },
        }
    return {
        "id": str(lesson.pk),
        "courseId": str(lesson.module.course_id),
        "moduleId": str(lesson.module_id),
        "moduleTitle": lesson.module.title,
        "moduleLabel": lesson.module.label,
        "title": lesson.title,
        "order": lesson.order,
        "contentType": lesson.content_type,
        "assetRef": lesson.asset_ref,
        "externalUrl": lesson.external_url,
        "scormVersion": lesson.scorm_version,
        "estimatedMinutes": lesson.estimated_minutes,
        "frameworkTags": lesson.framework_tags,
        "keyPoints": lesson.key_points,
        "quiz": quiz,
        "progress": {
            "completedAt": progress.completed_at.isoformat() if progress.completed_at else None,
            "score": progress.score,
            "runtime": progress.runtime,
        }
        if progress
        else None,
    }


class LessonCreateView(AuthorWrites, APIView):
    @extend_schema(request=LessonWriteSerializer, responses={201: LessonDetailSerializer})
    def post(self, request, module_id):
        module = get_object_or_404(Module, tenant=acting_tenant(request), pk=module_id)
        body = LessonWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = resolve_quiz(request, dict(body.validated_data))
        lesson = Lesson.objects.create(tenant=module.tenant, module=module, **data)
        return Response(lesson_detail(lesson, None), status=201)


class LessonDetailView(AuthorWrites, APIView):
    @extend_schema(responses=LessonDetailSerializer)
    def get(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        return Response(lesson_detail(lesson, my_enrollment(request, lesson.module.course)))

    @extend_schema(request=LessonWriteSerializer, responses=LessonDetailSerializer)
    def patch(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        body = LessonWriteSerializer(lesson, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        for field, value in resolve_quiz(request, dict(body.validated_data)).items():
            setattr(lesson, field, value)
        lesson.save()
        return Response(lesson_detail(lesson, None))


class EnrollView(APIView):
    """Self-enrollment in a published course. Idempotent: never resets progress."""

    @extend_schema(request=None, responses={200: EnrollmentSerializer, 201: EnrollmentSerializer})
    def post(self, request, course_id):
        course = get_course(request, course_id)
        if course.status != PublishStatus.PUBLISHED:
            raise Conflict("Only published courses take enrollments.")
        enrollment, created = Enrollment.objects.get_or_create(
            course=course, member=request.user, defaults={"tenant": course.tenant}
        )
        return Response(EnrollmentSerializer(enrollment).data, status=201 if created else 200)


class AssignView(APIView):
    """Staff assign a course to members (port of `assignCourse`). Existing
    enrollments keep their progress; only new ones are created."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    @extend_schema(request=AssignSerializer, responses=AssignResultSerializer)
    def post(self, request, course_id):
        course = get_course(request, course_id)
        if course.status != PublishStatus.PUBLISHED:
            raise Conflict("Publish the course before assigning it.")
        body = AssignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        ids = set(body.validated_data["memberIds"])
        members = list(Member.objects.filter(tenant=course.tenant, pk__in=ids))
        if len(members) != len(ids):
            raise ValidationError({"memberIds": ["Some members aren't in this tenant."]})

        assigned = skipped = 0
        with transaction.atomic():
            for member in members:
                try:
                    with transaction.atomic():
                        Enrollment.objects.create(
                            tenant=course.tenant,
                            course=course,
                            member=member,
                            assigned_by=request.user,
                            due_at=body.validated_data.get("dueAt"),
                        )
                    assigned += 1
                except IntegrityError:
                    skipped += 1
            record(
                action="learning.course.assigned",
                actor=request.user,
                tenant=request.tenant,
                target=course,
                assigned=assigned,
                skipped=skipped,
            )
        return Response({"assigned": assigned, "skipped": skipped})


class MyEnrollmentsView(APIView):
    """The signed-in learner's courses with progress and the next lesson (Home)."""

    @extend_schema(responses=MyEnrollmentSerializer(many=True))
    def get(self, request):
        tenant = acting_tenant(request)
        enrollments = Enrollment.objects.filter(
            tenant=tenant, member=request.user, course__status=PublishStatus.PUBLISHED
        ).select_related("course")
        result = []
        for enrollment in enrollments:
            done = completed_lesson_ids(enrollment)
            lessons = Lesson.objects.filter(module__course=enrollment.course).order_by(
                "module__order", "module__created_at", "order", "created_at"
            )
            next_lesson = next(
                (lsn for lsn in lessons.select_related("module") if lsn.pk not in done), None
            )
            result.append(
                {
                    **EnrollmentSerializer(enrollment).data,
                    "course": {"id": str(enrollment.course.pk), "title": enrollment.course.title},
                    "nextLesson": {
                        "id": str(next_lesson.pk),
                        "title": next_lesson.title,
                        "moduleTitle": next_lesson.module.title,
                        "moduleLabel": next_lesson.module.label,
                        "estimatedMinutes": next_lesson.estimated_minutes,
                    }
                    if next_lesson
                    else None,
                }
            )
        return Response(result)


class LessonCompleteView(APIView):
    """Completion for content without a quiz (video, SCORM, cmi5, game, Unity).

    Lessons with a quiz complete only through grading, so a client can't skip it.
    """

    @extend_schema(request=CompleteSerializer, responses=CompletionSerializer)
    def post(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        if lesson.quiz_id is not None:
            raise Conflict("Finish this lesson's quiz to complete it.")
        enrollment = require_enrollment(request, lesson.module.course)
        body = CompleteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        result = complete_lesson(enrollment, lesson, score=body.validated_data.get("score"))
        return Response(result.as_json())


class LessonRuntimeView(APIView):
    """Saves SCORM/cmi5 runtime state so the player resumes where the learner left off."""

    @extend_schema(request=RuntimeSerializer, responses={204: None})
    def put(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        enrollment = require_enrollment(request, lesson.module.course)
        body = RuntimeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        LessonProgress.objects.update_or_create(
            enrollment=enrollment,
            lesson=lesson,
            defaults={"runtime": body.validated_data["cmi"]},
            create_defaults={"tenant": enrollment.tenant, "runtime": body.validated_data["cmi"]},
        )
        touch(enrollment)
        return Response(status=204)
