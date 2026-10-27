"""The shared course library: superadmins author in the reserved "library" tenant and
copy courses into customer tenants as drafts.

Authoring uses the normal course APIs with `X-Forge-Tenant: library`; these two
endpoints work across tenants, so they read and write under `rls.bypass()`.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsActiveMember
from apps.audit.models import record
from apps.learning.models import Course
from apps.learning.serializers import CourseSerializer
from apps.tenants import rls
from apps.tenants.library import LIBRARY_TENANT_ID
from apps.tenants.models import Tenant

from .sharing import copy_course


class SuperadminView(APIView):
    permission_classes = [IsActiveMember]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not request.user.is_superadmin:
            raise PermissionDenied("Superadmin only.")


class ShareSerializer(serializers.Serializer):
    tenantIds = serializers.ListField(
        child=serializers.CharField(max_length=63), min_length=1, max_length=200
    )


class CreatedCourseSerializer(serializers.Serializer):
    tenantId = serializers.CharField()
    courseId = serializers.UUIDField()


class ShareResultSerializer(serializers.Serializer):
    created = CreatedCourseSerializer(many=True)


class LibraryCourseListView(SuperadminView):
    @extend_schema(responses=CourseSerializer(many=True))
    def get(self, request):
        with rls.bypass():
            courses = list(Course.objects.filter(tenant_id=LIBRARY_TENANT_ID))
        return Response(CourseSerializer(courses, many=True).data)


class LibraryShareView(SuperadminView):
    @extend_schema(request=ShareSerializer, responses={201: ShareResultSerializer})
    def post(self, request, course_id):
        body = ShareSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        tenant_ids = list(dict.fromkeys(body.validated_data["tenantIds"]))
        if LIBRARY_TENANT_ID in tenant_ids:
            raise ValidationError({"tenantIds": ["Pick customer tenants, not the library."]})

        created = []
        with rls.bypass(), transaction.atomic():
            source = get_object_or_404(Course, tenant_id=LIBRARY_TENANT_ID, pk=course_id)
            tenants = {t.id: t for t in Tenant.objects.filter(pk__in=tenant_ids)}
            unknown = [t for t in tenant_ids if t not in tenants]
            if unknown:
                raise ValidationError({"tenantIds": [f"Unknown tenant: {', '.join(unknown)}."]})
            for tenant_id in tenant_ids:
                tenant = tenants[tenant_id]
                copy = copy_course(source, tenant, request.user)
                record(
                    action="library.course.shared",
                    actor=request.user,
                    tenant=tenant,
                    target=copy,
                    sourceCourseId=str(source.pk),
                )
                created.append({"tenantId": tenant_id, "courseId": copy.pk})
        return Response({"created": created}, status=201)
