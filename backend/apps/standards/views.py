import hashlib
from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.learning.access import Conflict, acting_tenant, get_lesson, require_enrollment
from apps.learning.models import Lesson, LessonProgress, Module
from apps.learning.progress import complete_lesson, lock_enrollment, touch

from . import storage
from .access import content_token, load_launch
from .models import Binding, Launch, Package, Statement
from .packages import MAX_ZIP
from .runtime import outcome, runtime_hash
from .serializers import (
    AttachResultSerializer,
    AttachSerializer,
    CommitResultSerializer,
    CommitSerializer,
    ConfigurationSerializer,
    LaunchSerializer,
    PackageSerializer,
    StatementSerializer,
    UploadSerializer,
)


class Unavailable(APIException):
    status_code = 503
    default_detail = "SCORM import/playback is not configured."


class PrivateView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class StaffView(PrivateView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF


class PackagesView(StaffView):
    @extend_schema(responses=PackageSerializer(many=True))
    def get(self, request):
        return Response(
            PackageSerializer(
                Package.objects.filter(tenant=acting_tenant(request))[:200], many=True
            ).data
        )

    @extend_schema(request=UploadSerializer, responses={202: PackageSerializer})
    def post(self, request):
        if not settings.STANDARDS_ENABLED:
            raise Unavailable()
        body = UploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        upload = body.validated_data["file"]
        if upload.size > MAX_ZIP or not upload.name.lower().endswith(".zip"):
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Upload a SCORM ZIP of at most 50 MB.")
        raw = upload.read(MAX_ZIP + 1)
        if len(raw) > MAX_ZIP:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Package exceeds 50 MB.")
        package = Package(
            tenant=acting_tenant(request),
            created_by=request.user,
            title=body.validated_data["title"],
            sha256=hashlib.sha256(raw).hexdigest(),
        )
        storage.put(storage.key_for(package.tenant_id, package.pk, "upload.zip"), raw)
        with transaction.atomic():
            package.save()
            record(
                action="standards.package.uploaded",
                actor=request.user,
                tenant=request.tenant,
                target=package,
                sha256=package.sha256,
            )
        return Response(PackageSerializer(package).data, status=202)


class PackageView(StaffView):
    @extend_schema(responses=PackageSerializer)
    def get(self, request, package_id):
        package = get_object_or_404(Package, tenant=acting_tenant(request), pk=package_id)
        return Response(PackageSerializer(package).data)

    @extend_schema(responses={204: None})
    def delete(self, request, package_id):
        with transaction.atomic():
            package = get_object_or_404(
                Package.objects.select_for_update(), tenant=acting_tenant(request), pk=package_id
            )
            if package.status == Package.Status.PROCESSING:
                raise Conflict("Wait for processing before archiving.")
            package.status = Package.Status.ARCHIVED
            package.save(update_fields=["status", "updated_at"])
            Launch.objects.filter(binding__package=package).update(revoked=True)
            record(
                action="standards.package.archived",
                actor=request.user,
                tenant=request.tenant,
                target=package,
            )
        return Response(status=204)


class AttachView(StaffView):
    @extend_schema(request=AttachSerializer, responses={201: AttachResultSerializer})
    def post(self, request, package_id):
        body = AttachSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        package = get_object_or_404(
            Package, tenant=acting_tenant(request), pk=package_id, status=Package.Status.READY
        )
        module = get_object_or_404(
            Module, tenant=request.tenant, pk=body.validated_data["moduleId"]
        )
        with transaction.atomic():
            package = get_object_or_404(
                Package.objects.select_for_update(), pk=package.pk, status=Package.Status.READY
            )
            # Serialize insertion order and keep package versions immutable for existing lessons.
            Module.objects.select_for_update().get(pk=module.pk)
            order = (module.lessons.aggregate(value=Max("order"))["value"] or 0) + 1
            lesson = Lesson.objects.create(
                tenant=request.tenant,
                module=module,
                title=body.validated_data["title"],
                content_type="scorm",
                scorm_version=package.scorm_version,
                order=order,
            )
            Binding.objects.create(tenant=request.tenant, lesson=lesson, package=package)
            record(
                action="standards.package.attached",
                actor=request.user,
                tenant=request.tenant,
                target=lesson,
                package=str(package.pk),
            )
        return Response({"lessonId": str(lesson.pk)}, status=201)


def content_origin(request) -> str:
    url = urlsplit(settings.STANDARDS_CONTENT_ORIGIN)
    app_origins = settings.STANDARDS_APP_ORIGINS
    if (
        url.scheme not in {"https", "http"}
        or not url.netloc
        or url.path not in {"", "/"}
        or url.username
        or url.password
        or url.query
        or url.fragment
        or (url.scheme != "https" and not settings.DEBUG)
    ):
        raise Unavailable("Configure an isolated SCORM content origin.")
    origin = f"{url.scheme}://{url.netloc}"
    if origin == request.build_absolute_uri("/").rstrip("/") or origin in app_origins:
        raise Unavailable("SCORM content must not share the API or application origin.")
    if request.headers.get("Origin") not in app_origins:
        raise Unavailable("The application origin is not approved for SCORM playback.")
    return origin


class LaunchView(PrivateView):
    @extend_schema(request=None, responses={201: LaunchSerializer})
    def post(self, request, lesson_id):
        if not settings.STANDARDS_ENABLED:
            raise Unavailable()
        origin = content_origin(request)
        lesson = get_lesson(request, lesson_id)
        if lesson.module.course.status != "published":
            raise Conflict("Publish this course before launching.")
        binding = get_object_or_404(
            Binding.objects.select_related("package"),
            tenant=acting_tenant(request),
            lesson=lesson,
            package__status=Package.Status.READY,
        )
        if lesson.quiz_id:
            raise Conflict("SCORM package lessons cannot also have a native quiz.")
        enrollment = require_enrollment(request, lesson.module.course)
        with transaction.atomic():
            get_object_or_404(
                Package.objects.select_for_update(),
                pk=binding.package_id,
                status=Package.Status.READY,
            )
            enrollment = lock_enrollment(enrollment)
            progress = LessonProgress.objects.filter(enrollment=enrollment, lesson=lesson).first()
            Launch.objects.filter(enrollment=enrollment, binding=binding).update(revoked=True)
            launch = Launch.objects.create(
                tenant=request.tenant,
                enrollment=enrollment,
                binding=binding,
                runtime=progress.runtime if progress else {},
                expires_at=timezone.now() + timedelta(seconds=settings.STANDARDS_LAUNCH_TTL),
            )
        token = content_token(launch)
        return Response(
            {
                "id": str(launch.pk),
                "origin": origin,
                "url": f"{origin}/launch/{token}/",
                "expiresAt": launch.expires_at.isoformat(),
            },
            status=201,
        )


class CommitView(PrivateView):
    @extend_schema(request=CommitSerializer, responses=CommitResultSerializer)
    def post(self, request, launch_id):
        if not settings.STANDARDS_ENABLED:
            raise Unavailable()
        body = CommitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        launch = load_launch(launch_id, request)
        with transaction.atomic():
            enrollment = lock_enrollment(launch.enrollment)
            launch = load_launch(launch_id, request)
            digest = runtime_hash(data["cmi"])
            if data["sequence"] == launch.sequence:
                if digest != launch.last_hash:
                    raise Conflict("This commit sequence was already used with different data.")
                return Response(launch.last_result)
            if data["sequence"] != launch.sequence + 1:
                raise Conflict("SCORM commits must be applied in order. Relaunch the lesson.")
            completed, score = outcome(data["cmi"], launch.binding.package.scorm_version)
            progress, _ = LessonProgress.objects.get_or_create(
                enrollment=enrollment,
                lesson=launch.binding.lesson,
                defaults={"tenant": request.tenant},
            )
            progress.runtime = data["cmi"]
            progress.save(update_fields=["runtime", "updated_at"])
            completion = None
            if completed:
                completion = complete_lesson(
                    enrollment, launch.binding.lesson, score=score
                ).as_json()
            else:
                touch(enrollment)
            launch.runtime = data["cmi"]
            launch.sequence = data["sequence"]
            launch.last_hash = digest
            launch.last_result = {"sequence": launch.sequence, "completion": completion}
            launch.save(update_fields=["runtime", "sequence", "last_hash", "last_result"])
        return Response(launch.last_result)


class DeliveryView(StaffView):
    @extend_schema(responses=StatementSerializer(many=True))
    def get(self, request):
        return Response(
            StatementSerializer(
                Statement.objects.filter(tenant=acting_tenant(request)).order_by("-created_at")[
                    :100
                ],
                many=True,
            ).data
        )


class ConfigurationView(StaffView):
    @extend_schema(responses=ConfigurationSerializer)
    def get(self, request):
        return Response(
            {
                "enabled": settings.STANDARDS_ENABLED,
                "storageConfigured": bool(
                    (settings.DEBUG and settings.STANDARDS_LOCAL_ROOT)
                    or all(
                        [
                            settings.STANDARDS_S3_ENDPOINT,
                            settings.STANDARDS_S3_BUCKET,
                            settings.STANDARDS_S3_ACCESS_KEY,
                            settings.STANDARDS_S3_SECRET_KEY,
                        ]
                    )
                ),
                "contentOriginConfigured": bool(
                    settings.STANDARDS_CONTENT_ORIGIN and settings.STANDARDS_APP_ORIGINS
                ),
                "xapiRecordingEnabled": settings.XAPI_RECORDING_ENABLED,
                "lrsConfigured": bool(
                    settings.XAPI_LRS_ENDPOINT.startswith("https://") and settings.XAPI_LRS_AUTH
                ),
            }
        )
