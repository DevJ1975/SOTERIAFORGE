from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.learning.access import Conflict, acting_tenant, get_lesson, require_enrollment
from apps.learning.progress import complete_lesson, lock_enrollment, touch

from .grading import MalformedQuiz, grade, is_correct, parse_questions
from .models import CheckAnswer, Quiz, QuizAttempt
from .serializers import (
    AttemptResultSerializer,
    AttemptSerializer,
    CheckAnswerSerializer,
    CheckResultSerializer,
    QuizSerializer,
)


class StaffOnly:
    """Quizzes carry their answer keys, so only tenant staff read or write them here."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF


class QuizListView(StaffOnly, APIView):
    @extend_schema(responses=QuizSerializer(many=True))
    def get(self, request):
        quizzes = Quiz.objects.filter(tenant=acting_tenant(request))
        return Response(QuizSerializer(quizzes, many=True).data)

    @extend_schema(request=QuizSerializer, responses={201: QuizSerializer})
    def post(self, request):
        body = QuizSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        quiz = body.save(tenant=acting_tenant(request), created_by=request.user)
        return Response(QuizSerializer(quiz).data, status=201)


class QuizDetailView(StaffOnly, APIView):
    def _quiz(self, request, quiz_id):
        return get_object_or_404(Quiz, tenant=acting_tenant(request), pk=quiz_id)

    @extend_schema(responses=QuizSerializer)
    def get(self, request, quiz_id):
        return Response(QuizSerializer(self._quiz(request, quiz_id)).data)

    @extend_schema(request=QuizSerializer, responses=QuizSerializer)
    def patch(self, request, quiz_id):
        body = QuizSerializer(self._quiz(request, quiz_id), data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        return Response(QuizSerializer(body.save()).data)


def gradable_questions(quiz: Quiz) -> list[dict]:
    try:
        return parse_questions(quiz.questions)
    except MalformedQuiz:
        # Never grade a malformed or tampered quiz (anti-cheat).
        raise Conflict("This quiz can't be graded right now. Tell your instructor.") from None


class LessonCheckView(APIView):
    """Answer one knowledge-check question. The first answer per question is
    recorded as given; later answers can still solve it and finish the lesson."""

    @extend_schema(request=CheckAnswerSerializer, responses=CheckResultSerializer)
    def post(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        if lesson.quiz is None or lesson.content_type == "quiz":
            raise Conflict("This lesson has no knowledge check.")
        enrollment = require_enrollment(request, lesson.module.course)
        body = CheckAnswerSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        response = dict(body.validated_data)

        questions = gradable_questions(lesson.quiz)
        question = next((q for q in questions if q["id"] == response["questionId"]), None)
        if question is None:
            raise ValidationError({"questionId": ["Not a question in this check."]})
        correct = is_correct(question, response)

        completion = None
        with transaction.atomic():
            enrollment = lock_enrollment(enrollment)
            now = timezone.now()
            answer = (
                CheckAnswer.objects.select_for_update()
                .filter(enrollment=enrollment, lesson=lesson, question_id=question["id"])
                .first()
            )
            first_try = answer is None
            if first_try:
                answer = CheckAnswer.objects.create(
                    tenant=enrollment.tenant,
                    enrollment=enrollment,
                    lesson=lesson,
                    quiz=lesson.quiz,
                    question_id=question["id"],
                    first_response=response,
                    first_correct=correct,
                    first_answered_at=now,
                    solved_at=now if correct else None,
                )
            else:
                answer.attempts += 1
                if correct and answer.solved_at is None:
                    answer.solved_at = now
                answer.save()

            answers = CheckAnswer.objects.filter(enrollment=enrollment, lesson=lesson)
            solved = set(
                answers.filter(solved_at__isnull=False).values_list("question_id", flat=True)
            )
            if all(q["id"] in solved for q in questions):
                first_right = set(
                    answers.filter(first_correct=True).values_list("question_id", flat=True)
                )
                total = sum(q["points"] for q in questions)
                earned = sum(q["points"] for q in questions if q["id"] in first_right)
                score = int(earned * 100 / total + 0.5) if total else 100
                completion = complete_lesson(enrollment, lesson, score=score)
            else:
                touch(enrollment)

        feedback = question.get("feedback") or {}
        return Response(
            {
                "questionId": question["id"],
                "correct": correct,
                "firstTry": first_try,
                "solved": answer.solved_at is not None,
                "feedback": feedback.get("correct" if correct else "incorrect"),
                "completion": completion.as_json() if completion else None,
            }
        )


class LessonAttemptView(APIView):
    """Submit a whole graded quiz (port of `submitQuiz`). The server grades,
    enforces `maxAttempts` under a row lock, and completes the lesson on a pass."""

    @extend_schema(request=AttemptSerializer, responses=AttemptResultSerializer)
    def post(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        if lesson.quiz is None or lesson.content_type != "quiz":
            raise Conflict("This lesson isn't a graded quiz.")
        enrollment = require_enrollment(request, lesson.module.course)
        body = AttemptSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        responses = [dict(r) for r in body.validated_data["responses"]]
        quiz = lesson.quiz
        result = grade(gradable_questions(quiz), responses, quiz.pass_threshold)

        with transaction.atomic():
            enrollment = lock_enrollment(enrollment)
            used = QuizAttempt.objects.filter(enrollment=enrollment, quiz=quiz).count()
            if quiz.max_attempts is not None and used >= quiz.max_attempts:
                raise Conflict("No quiz attempts remaining.")
            attempt = QuizAttempt.objects.create(
                tenant=enrollment.tenant,
                enrollment=enrollment,
                lesson=lesson,
                quiz=quiz,
                number=used + 1,
                responses=responses,
                earned_points=result.earned_points,
                total_points=result.total_points,
                score_pct=result.score_pct,
                passed=result.passed,
                per_question=result.per_question_json(),
            )
            record(
                action="assessments.quiz.graded",
                actor=enrollment.member,
                tenant=enrollment.tenant,
                target=attempt,
                lesson=str(lesson.pk),
                score=result.score_pct,
                passed=result.passed,
                number=attempt.number,
            )
            if result.passed:
                completion = complete_lesson(enrollment, lesson, score=result.score_pct)
            else:
                completion = None
                touch(enrollment)

        return Response(
            {
                "earnedPoints": result.earned_points,
                "totalPoints": result.total_points,
                "scorePct": result.score_pct,
                "passed": result.passed,
                "perQuestion": result.per_question_json(),
                "attemptsUsed": attempt.number,
                "attemptsRemaining": max(0, quiz.max_attempts - attempt.number)
                if quiz.max_attempts is not None
                else None,
                "completion": completion.as_json() if completion else None,
            }
        )
