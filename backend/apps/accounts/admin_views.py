"""Tenant admins manage their members; data-rights requests (export, erasure).

Ports of the `inviteMember`, `deactivateMember`, `exportUserData` and `deleteUserData`
Cloud Functions.
"""

import logging

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assessments.models import CheckAnswer, QuizAttempt
from apps.audit.models import record
from apps.gamification.models import ActivityDay, CrewMembership, XpEvent
from apps.learning.models import Enrollment, LessonProgress

from . import tokens
from .emails import _base_url, send_link_email
from .models import ASSIGNABLE_ROLES, Member, OneTimeToken, Role
from .permissions import HasTenantRole, IsActiveMember
from .serializers import MemberSerializer

log = logging.getLogger(__name__)


class TenantAdminView(APIView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = (Role.TENANT_ADMIN,)


class InviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ASSIGNABLE_ROLES)
    displayName = serializers.CharField(max_length=200, required=False, allow_blank=True)


class InviteResultSerializer(serializers.Serializer):
    member = MemberSerializer()
    # The same link the email carries, so an admin can pass it on while email
    # delivery isn't configured.
    inviteLink = serializers.CharField()


class InviteView(TenantAdminView):
    """Invite someone to the acting tenant; they set a password from the emailed link."""

    @extend_schema(request=InviteSerializer, responses={201: InviteResultSerializer})
    def post(self, request):
        body = InviteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with transaction.atomic():
            try:
                with transaction.atomic():
                    member = Member.objects.create(
                        tenant=request.tenant,
                        email=data["email"],
                        role=data["role"],
                        display_name=data.get("displayName", ""),
                        status=Member.Status.INVITED,
                    )
            except IntegrityError as exc:
                raise ValidationError(
                    {"email": ["This email already has an account here."]}
                ) from exc
            raw = tokens.issue_one_time(member, OneTimeToken.Purpose.INVITE)
            record(
                action="member.invited",
                actor=request.user,
                tenant=request.tenant,
                target=member,
                role=member.role,
            )
        try:
            send_link_email(member, OneTimeToken.Purpose.INVITE, raw)
        except Exception:
            log.exception("Could not send invite email")
        link = f"{_base_url(member)}/accept-invite?token={raw}"
        return Response(
            {"member": MemberSerializer(member).data, "inviteLink": link},
            status=status.HTTP_201_CREATED,
        )


class MemberStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Member.Status.ACTIVE, Member.Status.DEACTIVATED])


class MemberStatusView(TenantAdminView):
    """Deactivate a member (ending their sessions) or reactivate them."""

    @extend_schema(request=MemberStatusSerializer, responses=MemberSerializer)
    def patch(self, request, member_id):
        body = MemberStatusSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        new_status = body.validated_data["status"]
        with transaction.atomic():
            target = get_object_or_404(
                Member.objects.select_for_update(), pk=member_id, tenant=request.tenant
            )
            if target.pk == request.user.pk:
                raise PermissionDenied("You can't change your own status.")
            if new_status == Member.Status.ACTIVE and not target.password:
                raise ValidationError("This member hasn't accepted their invite yet.")
            if target.status != new_status:
                old = target.status
                target.status = new_status
                target.save(update_fields=["status", "updated_at"])
                if new_status == Member.Status.DEACTIVATED:
                    tokens.revoke_all(target)
                record(
                    action="member.status.set",
                    actor=request.user,
                    tenant=request.tenant,
                    target=target,
                    old=old,
                    new=new_status,
                )
        return Response(MemberSerializer(target).data)


def _subject(request, member_id) -> Member:
    """The member a data-rights request is about: yourself, or (as an admin) someone else."""
    if str(member_id) == str(request.user.pk):
        return request.user
    if request.user.is_superadmin:
        return get_object_or_404(Member, pk=member_id)
    if request.user.role == Role.TENANT_ADMIN:
        return get_object_or_404(Member, pk=member_id, tenant=request.tenant)
    raise PermissionDenied("You can only export your own data.")


class DataExportView(APIView):
    """Everything Forge holds about one member (data portability)."""

    @extend_schema(responses={200: None})
    def get(self, request, member_id):
        member = _subject(request, member_id)
        enrollments = Enrollment.objects.filter(member=member)
        data = {
            "exportedAt": timezone.now().isoformat(),
            "member": MemberSerializer(member).data | {"createdAt": member.created_at.isoformat()},
            "enrollments": list(
                enrollments.values(
                    "id",
                    "course_id",
                    "course__title",
                    "progress_pct",
                    "completed_at",
                    "due_at",
                    "created_at",
                )
            ),
            "lessonProgress": list(
                LessonProgress.objects.filter(enrollment__in=enrollments).values(
                    "lesson_id", "lesson__title", "score", "completed_at", "updated_at"
                )
            ),
            "knowledgeChecks": list(
                CheckAnswer.objects.filter(enrollment__in=enrollments).values(
                    "lesson_id",
                    "question_id",
                    "first_response",
                    "first_correct",
                    "first_answered_at",
                    "attempts",
                    "solved_at",
                )
            ),
            "quizAttempts": list(
                QuizAttempt.objects.filter(enrollment__in=enrollments).values(
                    "lesson_id", "number", "responses", "score_pct", "passed", "created_at"
                )
            ),
            "xpEvents": list(
                XpEvent.objects.filter(member=member).values(
                    "amount", "source", "source_id", "created_at"
                )
            ),
            "activityDays": [
                d.isoformat()
                for d in ActivityDay.objects.filter(member=member).values_list("day", flat=True)
            ],
            "crews": list(
                CrewMembership.objects.filter(member=member).values("crew__name", "cohort__name")
            ),
        }
        with transaction.atomic():
            record(
                action="data.export",
                actor=request.user,
                tenant=member.tenant,
                target=member,
            )
        response = Response(data)
        response["Cache-Control"] = "no-store"
        return response


class ErasureSerializer(serializers.Serializer):
    # Must be explicitly true: erasure can't be undone.
    confirm = serializers.BooleanField()

    def validate_confirm(self, value):
        if value is not True:
            raise serializers.ValidationError("Erasure must be confirmed.")
        return value


class DataErasureView(APIView):
    """Right to erasure (superadmin only).

    Removes the member's personal data and access, and keeps the non-identifying
    learning records (progress, scores, XP) that tenant reports and the audit trail
    rely on.
    """

    @extend_schema(request=ErasureSerializer, responses={204: None})
    def post(self, request, member_id):
        if not request.user.is_superadmin:
            raise PermissionDenied("Only a superadmin can erase a member's data.")
        ErasureSerializer(data=request.data).is_valid(raise_exception=True)
        with transaction.atomic():
            member = get_object_or_404(Member.objects.select_for_update(), pk=member_id)
            if member.pk == request.user.pk:
                raise PermissionDenied("You can't erase your own account.")
            member.email = f"erased+{member.pk}@deleted.invalid"
            member.display_name = "Deleted user"
            member.password = ""
            member.status = Member.Status.DEACTIVATED
            member.save()
            tokens.revoke_all(member)
            member.one_time_tokens.all().delete()
            CheckAnswer.objects.filter(enrollment__member=member).update(first_response={})
            QuizAttempt.objects.filter(enrollment__member=member).update(responses=[])
            record(action="data.erasure", actor=request.user, tenant=member.tenant, target=member)
        return Response(status=status.HTTP_204_NO_CONTENT)
