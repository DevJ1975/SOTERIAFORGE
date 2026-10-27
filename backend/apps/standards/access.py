from django.conf import settings
from django.core import signing
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.learning.models import PublishStatus
from apps.tenants import rls

from .models import Launch, Package


def load_launch(launch_id, request=None):
    launch = get_object_or_404(
        Launch.objects.select_related(
            "enrollment__member",
            "enrollment__tenant",
            "enrollment__course",
            "binding__package",
            "binding__lesson",
        ),
        pk=launch_id,
    )
    enrollment = launch.enrollment
    if (
        launch.revoked
        or launch.expires_at <= timezone.now()
        or launch.binding.package.status != Package.Status.READY
        or not enrollment.member.is_active
        or enrollment.tenant.status != "active"
        or enrollment.course.status != PublishStatus.PUBLISHED
        or enrollment.course_id != launch.binding.lesson.module.course_id
        or launch.binding.lesson.content_type != "scorm"
    ):
        raise PermissionDenied("This SCORM launch is no longer active.")
    if request and (
        enrollment.member_id != request.user.pk or launch.tenant_id != request.tenant.pk
    ):
        raise PermissionDenied("This launch belongs to another enrollment.")
    return launch


def content_token(launch: Launch) -> str:
    return signing.dumps(
        {"id": str(launch.pk), "tenant": launch.tenant_id}, salt="standards-content", compress=True
    )


def from_content_token(token: str) -> Launch:
    try:
        data = signing.loads(token, salt="standards-content", max_age=settings.STANDARDS_LAUNCH_TTL)
        rls.set_tenant(data["tenant"])
        return load_launch(data["id"])
    except (signing.BadSignature, KeyError, ValueError) as error:
        raise PermissionDenied("Invalid or expired content launch.") from error
