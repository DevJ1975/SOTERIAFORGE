"""Read-only reporting: a tenant's enrollment progress, and cross-tenant platform totals."""

import uuid

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Member, Role
from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.learning.access import acting_tenant
from apps.learning.models import Enrollment
from apps.tenants import rls
from apps.tenants.library import LIBRARY_TENANT_ID
from apps.tenants.models import Tenant

from . import analytics


class EnrollmentRowSerializer(serializers.Serializer):
    memberId = serializers.UUIDField()
    memberName = serializers.CharField()
    email = serializers.EmailField()
    courseId = serializers.UUIDField()
    courseTitle = serializers.CharField()
    progressPct = serializers.IntegerField()
    completedAt = serializers.DateTimeField(allow_null=True)
    dueAt = serializers.DateTimeField(allow_null=True)
    lastActivityAt = serializers.DateTimeField(allow_null=True)


class EnrollmentReportView(APIView):
    """Every enrollment in the acting tenant, one row per learner and course."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    @extend_schema(
        parameters=[OpenApiParameter("courseId", str, required=False)],
        responses=EnrollmentRowSerializer(many=True),
    )
    def get(self, request):
        rows = Enrollment.objects.filter(tenant=acting_tenant(request)).select_related(
            "member", "course"
        )
        course_id = request.query_params.get("courseId")
        if course_id:
            try:
                rows = rows.filter(course_id=uuid.UUID(course_id))
            except ValueError:
                rows = rows.none()
        return Response(
            [
                {
                    "memberId": e.member_id,
                    "memberName": e.member.display_name or e.member.email,
                    "email": e.member.email,
                    "courseId": e.course_id,
                    "courseTitle": e.course.title,
                    "progressPct": e.progress_pct,
                    "completedAt": e.completed_at,
                    "dueAt": e.due_at,
                    "lastActivityAt": e.last_activity_at,
                }
                for e in rows.order_by("course__title", "member__display_name", "member__email")
            ]
        )


class AnalyticsTotalsRowSerializer(serializers.Serializer):
    learners = serializers.IntegerField()
    activeLast7Days = serializers.IntegerField()
    enrollments = serializers.IntegerField()
    completions = serializers.IntegerField()
    completionRate = serializers.FloatField()
    averageProgressPct = serializers.IntegerField()
    firstTryPct = serializers.IntegerField(allow_null=True)


class AnalyticsCourseSerializer(serializers.Serializer):
    courseId = serializers.UUIDField()
    title = serializers.CharField()
    enrollments = serializers.IntegerField()
    completions = serializers.IntegerField()
    averageProgressPct = serializers.IntegerField()


class AnalyticsLessonSerializer(serializers.Serializer):
    lessonId = serializers.UUIDField()
    title = serializers.CharField()
    moduleTitle = serializers.CharField()
    completions = serializers.IntegerField()
    enrollments = serializers.IntegerField()
    firstTryPct = serializers.IntegerField(allow_null=True)


class AnalyticsWeekSerializer(serializers.Serializer):
    weekStart = serializers.DateField()
    activeLearners = serializers.IntegerField()
    lessonsCompleted = serializers.IntegerField()


class CohortAnalyticsSerializer(serializers.Serializer):
    generatedAt = serializers.DateTimeField()
    totals = AnalyticsTotalsRowSerializer()
    courses = AnalyticsCourseSerializer(many=True)
    lessons = AnalyticsLessonSerializer(many=True)
    weeks = AnalyticsWeekSerializer(many=True)


class AtRiskRulesSerializer(serializers.Serializer):
    inactiveDays = serializers.IntegerField()
    behindPoints = serializers.IntegerField()
    firstTryPct = serializers.IntegerField()
    missedSessions = serializers.IntegerField()


class AtRiskLearnerSerializer(serializers.Serializer):
    memberId = serializers.UUIDField()
    memberName = serializers.CharField()
    email = serializers.EmailField()
    cohortName = serializers.CharField(allow_null=True)
    crewName = serializers.CharField(allow_null=True)
    progressPct = serializers.IntegerField()
    lastActivityAt = serializers.DateTimeField(allow_null=True)
    firstTryPct = serializers.IntegerField(allow_null=True)
    sessionsMissed = serializers.IntegerField()
    reasons = serializers.ListField(
        child=serializers.ChoiceField(
            choices=["inactive", "overdue", "behind", "low_scores", "missed_sessions"]
        )
    )


class AtRiskSerializer(serializers.Serializer):
    generatedAt = serializers.DateTimeField()
    rules = AtRiskRulesSerializer()
    learners = AtRiskLearnerSerializer(many=True)


SCOPE_PARAMETERS = [
    OpenApiParameter("courseId", str, required=False),
    OpenApiParameter("cohortId", str, required=False),
]


class CohortAnalyticsView(APIView):
    """Progress, first-try accuracy and weekly activity for the learners staff teach."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    @extend_schema(parameters=SCOPE_PARAMETERS, responses=CohortAnalyticsSerializer)
    def get(self, request):
        data = analytics.analytics(analytics.Scope(request, acting_tenant(request)))
        return Response(CohortAnalyticsSerializer(data).data)


class AtRiskView(APIView):
    """Learners who match a plain at-risk rule, with the rules that matched."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    @extend_schema(parameters=SCOPE_PARAMETERS, responses=AtRiskSerializer)
    def get(self, request):
        data = analytics.at_risk(analytics.Scope(request, acting_tenant(request)))
        response = Response(AtRiskSerializer(data).data)
        response["Cache-Control"] = "no-store"
        return response


class TenantAnalyticsRowSerializer(serializers.Serializer):
    tenantId = serializers.CharField()
    name = serializers.CharField()
    status = serializers.CharField()
    plan = serializers.CharField()
    members = serializers.IntegerField()
    learners = serializers.IntegerField()
    enrollments = serializers.IntegerField()
    completions = serializers.IntegerField()
    completionRate = serializers.FloatField()


class AnalyticsTotalsSerializer(serializers.Serializer):
    tenants = serializers.IntegerField()
    members = serializers.IntegerField()
    learners = serializers.IntegerField()
    enrollments = serializers.IntegerField()
    completions = serializers.IntegerField()
    completionRate = serializers.FloatField()


class PlatformAnalyticsSerializer(serializers.Serializer):
    totals = AnalyticsTotalsSerializer()
    tenants = TenantAnalyticsRowSerializer(many=True)
    generatedAt = serializers.DateTimeField()


def _rate(completions: int, enrollments: int) -> float:
    """Completion rate as a percentage with one decimal; 0 with no enrollments."""
    return round(100 * completions / enrollments, 1) if enrollments else 0.0


class PlatformAnalyticsView(APIView):
    """Per-tenant member and enrollment counts plus platform totals (superadmin)."""

    permission_classes = [IsActiveMember]

    @extend_schema(responses=PlatformAnalyticsSerializer)
    def get(self, request):
        if not request.user.is_superadmin:
            raise PermissionDenied("Superadmin only.")
        # Counts span every tenant even if the superadmin is acting inside one.
        with rls.bypass():
            members = {
                r["tenant_id"]: r
                for r in Member.objects.filter(tenant__isnull=False)
                .values("tenant_id")
                .annotate(
                    total=Count("id"),
                    learners=Count("id", filter=Q(role=Role.LEARNER)),
                )
            }
            enrollments = {
                r["tenant_id"]: r
                for r in Enrollment.objects.values("tenant_id").annotate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(completed_at__isnull=False)),
                )
            }
            tenants = list(Tenant.objects.exclude(pk=LIBRARY_TENANT_ID))

        rows = []
        for t in tenants:
            m = members.get(t.id, {})
            e = enrollments.get(t.id, {})
            rows.append(
                {
                    "tenantId": t.id,
                    "name": t.name,
                    "status": t.status,
                    "plan": t.plan,
                    "members": m.get("total", 0),
                    "learners": m.get("learners", 0),
                    "enrollments": e.get("total", 0),
                    "completions": e.get("completed", 0),
                    "completionRate": _rate(e.get("completed", 0), e.get("total", 0)),
                }
            )
        totals = {
            key: sum(r[key] for r in rows)
            for key in ("members", "learners", "enrollments", "completions")
        }
        return Response(
            {
                "totals": {
                    "tenants": len(rows),
                    **totals,
                    "completionRate": _rate(totals["completions"], totals["enrollments"]),
                },
                "tenants": rows,
                "generatedAt": timezone.now(),
            }
        )
