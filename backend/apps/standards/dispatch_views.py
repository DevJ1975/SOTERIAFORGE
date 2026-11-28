"""Staff create and download LMS export packages; learners read their launch status."""

import re

from django.db.models import Avg
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import IsActiveMember
from apps.audit.models import record
from apps.learning.access import acting_tenant
from apps.learning.models import Course, Enrollment, LessonProgress, PublishStatus

from . import dispatch as packages
from .models import Dispatch
from .views import PrivateView, StaffView


class DispatchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    courseId = serializers.UUIDField(source="course_id")
    courseTitle = serializers.CharField(source="course.title")
    format = serializers.ChoiceField(choices=Dispatch.Format.choices)
    lmsOrigins = serializers.ListField(child=serializers.CharField(), source="lms_origins")
    revoked = serializers.BooleanField()
    createdAt = serializers.DateTimeField(source="created_at")
    launchUrl = serializers.SerializerMethodField()

    def get_launchUrl(self, dispatch) -> str:
        return packages.launch_url(dispatch)


class DispatchCreateSerializer(serializers.Serializer):
    courseId = serializers.UUIDField()
    format = serializers.ChoiceField(choices=Dispatch.Format.choices)
    lmsOrigins = serializers.ListField(
        child=serializers.CharField(max_length=300), required=False, default=list, max_length=50
    )


class DispatchUpdateSerializer(serializers.Serializer):
    lmsOrigins = serializers.ListField(
        child=serializers.CharField(max_length=300), required=False, max_length=50
    )
    revoked = serializers.BooleanField(required=False)


class DispatchSessionSerializer(serializers.Serializer):
    dispatchId = serializers.UUIDField()
    courseId = serializers.UUIDField()
    courseTitle = serializers.CharField()
    format = serializers.ChoiceField(choices=Dispatch.Format.choices)
    lmsOrigins = serializers.ListField(child=serializers.CharField())
    enrolled = serializers.BooleanField()
    progressPct = serializers.IntegerField()
    completed = serializers.BooleanField()
    completedAt = serializers.DateTimeField(allow_null=True)
    scorePct = serializers.IntegerField(allow_null=True)


def _dispatches(request):
    return Dispatch.objects.filter(tenant=acting_tenant(request)).select_related("course", "tenant")


class DispatchesView(StaffView):
    @extend_schema(responses=DispatchSerializer(many=True))
    def get(self, request):
        return Response(DispatchSerializer(_dispatches(request)[:200], many=True).data)

    @extend_schema(request=DispatchCreateSerializer, responses={201: DispatchSerializer})
    def post(self, request):
        body = DispatchCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        course = Course.objects.filter(
            tenant=acting_tenant(request), pk=data["courseId"], status=PublishStatus.PUBLISHED
        ).first()
        if course is None:
            raise ValidationError({"courseId": "Choose a published course."})
        dispatch = Dispatch.objects.create(
            tenant=request.tenant,
            course=course,
            format=data["format"],
            lms_origins=packages.clean_origins(
                data["lmsOrigins"], required=data["format"] == Dispatch.Format.SCORM12
            ),
            created_by=request.user,
        )
        record(
            action="standards.dispatch.created",
            actor=request.user,
            tenant=request.tenant,
            target=dispatch,
            course=str(course.pk),
            format=dispatch.format,
        )
        return Response(DispatchSerializer(dispatch).data, status=201)


class DispatchView(StaffView):
    @extend_schema(request=DispatchUpdateSerializer, responses=DispatchSerializer)
    def patch(self, request, dispatch_id):
        dispatch = get_object_or_404(_dispatches(request), pk=dispatch_id)
        body = DispatchUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if "lmsOrigins" in data:
            dispatch.lms_origins = packages.clean_origins(
                data["lmsOrigins"], required=dispatch.format == Dispatch.Format.SCORM12
            )
        if "revoked" in data:
            dispatch.revoked = data["revoked"]
        dispatch.save()
        record(
            action="standards.dispatch.updated",
            actor=request.user,
            tenant=request.tenant,
            target=dispatch,
            revoked=dispatch.revoked,
            origins=dispatch.lms_origins,
        )
        return Response(DispatchSerializer(dispatch).data)


class DispatchPackageView(StaffView):
    @extend_schema(responses={(200, "application/zip"): OpenApiTypes.BINARY})
    def get(self, request, dispatch_id):
        dispatch = get_object_or_404(_dispatches(request), pk=dispatch_id, revoked=False)
        slug = re.sub(r"[^a-z0-9]+", "-", dispatch.course.title.lower()).strip("-")[:60] or "forge"
        response = HttpResponse(packages.build(dispatch), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{slug}-{dispatch.format}.zip"'
        return response


class DispatchSessionView(PrivateView):
    """What the learner app reports to the LMS: this member's progress in the course."""

    permission_classes = [IsActiveMember]

    @extend_schema(responses=DispatchSessionSerializer)
    def get(self, request, dispatch_id):
        dispatch = (
            _dispatches(request)
            .filter(pk=dispatch_id, revoked=False, course__status=PublishStatus.PUBLISHED)
            .first()
        )
        if dispatch is None:
            raise NotFound("This course link is no longer active.")
        enrollment = Enrollment.objects.filter(
            tenant=request.tenant, course=dispatch.course, member=request.user
        ).first()
        score = None
        if enrollment is not None:
            score = LessonProgress.objects.filter(
                enrollment=enrollment, score__isnull=False
            ).aggregate(value=Avg("score"))["value"]
        return Response(
            {
                "dispatchId": dispatch.pk,
                "courseId": dispatch.course_id,
                "courseTitle": dispatch.course.title,
                "format": dispatch.format,
                "lmsOrigins": dispatch.lms_origins,
                "enrolled": enrollment is not None,
                "progressPct": enrollment.progress_pct if enrollment else 0,
                "completed": bool(enrollment and enrollment.completed_at),
                "completedAt": enrollment.completed_at if enrollment else None,
                "scorePct": None if score is None else round(score),
            }
        )
