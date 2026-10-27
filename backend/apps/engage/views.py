from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record

from .media import check_configuration, join_credentials
from .models import Classroom
from .serializers import ClassroomSerializer, JoinSerializer


class ClassroomListView(APIView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsActiveMember()]
        return super().get_permissions()

    @extend_schema(responses=ClassroomSerializer(many=True))
    def get(self, request):
        if request.tenant is None:
            raise PermissionDenied("Select a tenant to view classrooms.")
        rooms = Classroom.objects.filter(tenant=request.tenant)
        return Response(ClassroomSerializer(rooms, many=True).data)

    @extend_schema(request=ClassroomSerializer, responses={201: ClassroomSerializer})
    def post(self, request):
        body = ClassroomSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        check_configuration()
        with transaction.atomic():
            room = body.save(tenant=request.tenant, created_by=request.user)
            record(
                action="engage.classroom.created",
                actor=request.user,
                tenant=request.tenant,
                target=room,
            )
        return Response(ClassroomSerializer(room).data, status=201)


class ClassroomJoinView(APIView):
    @extend_schema(request=None, responses=JoinSerializer)
    def post(self, request, classroom_id):
        if request.tenant is None:
            raise PermissionDenied("Select a tenant to join a classroom.")
        room = get_object_or_404(Classroom, pk=classroom_id, tenant=request.tenant)
        credentials = join_credentials(
            room,
            request.user,
            can_screen_share=request.user.is_superadmin or request.user.role in TENANT_STAFF,
        )
        response = Response(credentials)
        response["Cache-Control"] = "no-store"
        return response
