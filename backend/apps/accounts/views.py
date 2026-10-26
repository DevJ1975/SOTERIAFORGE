from django.db import connection, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import record
from forge import firebase

from .models import Member, Role
from .permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from .serializers import MemberSerializer, MeSerializer, RoleChangeSerializer


def healthz(_request):
    """Railway health check: the process is up and Postgres answers."""
    with connection.cursor() as cur:
        cur.execute("SELECT 1")
    return JsonResponse({"ok": True})


class MeView(APIView):
    """Who the API thinks you are: membership, role and acting tenant."""

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        data = {
            "member": request.user,
            "tenant": request.tenant,
            "canAuthor": request.user.can_author,
        }
        return Response(MeSerializer(data).data)


class MemberListView(generics.ListAPIView):
    """Members of the acting tenant (staff only)."""

    serializer_class = MemberSerializer
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    def get_queryset(self):
        return Member.objects.filter(tenant=self.request.tenant)


class MemberRoleView(APIView):
    """Change a member's role in the acting tenant (port of the `setMemberRole` function)."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = (Role.TENANT_ADMIN,)

    @extend_schema(request=RoleChangeSerializer, responses=MemberSerializer)
    def patch(self, request, member_id):
        body = RoleChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        new_role = body.validated_data["role"]

        with transaction.atomic():
            target = get_object_or_404(
                Member.objects.select_for_update(), pk=member_id, tenant=request.tenant
            )
            if target.firebase_uid == request.user.firebase_uid:
                raise PermissionDenied("You can't change your own role.")
            old_role = target.role
            if old_role != new_role:
                target.role = new_role
                target.save(update_fields=["role", "updated_at"])
                record(
                    action="member.role.set",
                    actor=request.user,
                    tenant=request.tenant,
                    target=target,
                    old=old_role,
                    new=new_role,
                )
                # Inside the transaction: if Firebase rejects the claim update, the
                # role change rolls back rather than leaving the guards out of sync.
                firebase.set_role_claims(
                    uid=target.firebase_uid,
                    gcip_tenant_id=request.tenant.gcip_tenant_id,
                    role=new_role,
                    tenant_id=request.tenant.id,
                )
        return Response(MemberSerializer(target).data, status=status.HTTP_200_OK)
