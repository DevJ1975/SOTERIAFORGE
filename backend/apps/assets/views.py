"""File uploads for lessons: staff upload, any member of the tenant gets a signed read URL."""

import mimetypes
import re
import uuid

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.learning.access import acting_tenant
from apps.standards import storage
from apps.tenants import rls

from .models import Asset

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
URL_TTL_SECONDS = 900
LOCAL_URL_SALT = "assets.local-content"

# Active content (HTML, SVG, scripts) is never accepted, whatever the extension.
ALLOWED_PREFIXES = ("image/", "audio/", "video/")
ALLOWED_TYPES = {
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/json",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/vtt",
}
BLOCKED_TYPES = {"image/svg+xml"}
CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def check_content_type(content_type: str) -> str:
    base = content_type.split(";")[0].strip().lower()
    allowed = base in ALLOWED_TYPES or base.startswith(ALLOWED_PREFIXES)
    if not allowed or base in BLOCKED_TYPES:
        raise ValidationError({"file": [f"File type {base or 'unknown'!r} is not allowed."]})
    return base


def check_filename(name: str) -> str:
    if (
        not name
        or len(name) > 255
        or "/" in name
        or "\\" in name
        or name in {".", ".."}
        or CONTROL_CHARS.search(name)
    ):
        raise ValidationError({"file": ["Invalid file name."]})
    return name


class AssetSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    assetRef = serializers.CharField()
    filename = serializers.CharField()
    contentType = serializers.CharField()
    size = serializers.IntegerField()


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class AssetUrlSerializer(serializers.Serializer):
    url = serializers.URLField()
    expiresIn = serializers.IntegerField()


def asset_json(asset: Asset) -> dict:
    return {
        "id": asset.pk,
        "assetRef": asset.ref,
        "filename": asset.filename,
        "contentType": asset.content_type,
        "size": asset.size,
    }


class AssetListView(APIView):
    """Upload a file (POST multipart `file`) or list the tenant's uploads."""

    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF
    parser_classes = [MultiPartParser]

    @extend_schema(responses=AssetSerializer(many=True))
    def get(self, request):
        assets = Asset.objects.filter(tenant=acting_tenant(request))
        return Response([asset_json(a) for a in assets])

    @extend_schema(
        request={"multipart/form-data": UploadSerializer}, responses={201: AssetSerializer}
    )
    def post(self, request):
        tenant = acting_tenant(request)
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            raise ValidationError({"file": ["Invalid Content-Length."]}) from None
        if length > MAX_UPLOAD_BYTES + 1024 * 1024:  # headroom for multipart framing
            raise ValidationError({"file": ["Files can be at most 100 MB."]})
        body = UploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        upload = body.validated_data["file"]
        if upload.size > MAX_UPLOAD_BYTES:
            raise ValidationError({"file": ["Files can be at most 100 MB."]})
        if upload.size == 0:
            raise ValidationError({"file": ["The file is empty."]})
        filename = check_filename(upload.name or "")
        content_type = check_content_type(
            upload.content_type or mimetypes.guess_type(filename)[0] or ""
        )

        asset_id = uuid.uuid4()
        key = f"assets/{tenant.id}/{asset_id}"
        storage.put_stream(key, upload.file, content_type)
        with transaction.atomic():
            asset = Asset.objects.create(
                id=asset_id,
                tenant=tenant,
                key=key,
                filename=filename,
                content_type=content_type,
                size=upload.size,
                created_by=request.user,
            )
            record(
                action="assets.asset.uploaded",
                actor=request.user,
                tenant=tenant,
                target=asset,
                filename=filename,
                contentType=content_type,
                size=upload.size,
            )
        return Response(asset_json(asset), status=201)


class AssetUrlView(APIView):
    """A short-lived signed URL to read one asset (any active member of the tenant)."""

    @extend_schema(responses=AssetUrlSerializer)
    def get(self, request, asset_id):
        asset = get_object_or_404(Asset, tenant=acting_tenant(request), pk=asset_id)
        if storage.local_root() is not None:  # DEBUG pilot: Django serves the file itself
            token = signing.dumps(str(asset.pk), salt=LOCAL_URL_SALT)
            url = request.build_absolute_uri(f"/api/assets/{asset.pk}/content?sig={token}")
        else:
            url = storage.presigned_get(
                asset.key,
                expires=URL_TTL_SECONDS,
                filename=asset.filename,
                content_type=asset.content_type,
            )
        return Response({"url": url, "expiresIn": URL_TTL_SECONDS})


class AssetContentView(APIView):
    """Serves a locally stored file for a signed URL (DEBUG pilot with a local storage dir)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(exclude=True)
    def get(self, request, asset_id):
        if not settings.DEBUG or storage.local_root() is None:
            raise Http404
        try:
            signed = signing.loads(
                request.query_params.get("sig", ""), salt=LOCAL_URL_SALT, max_age=URL_TTL_SECONDS
            )
        except signing.BadSignature as exc:
            raise Http404 from exc
        if signed != str(asset_id):
            raise Http404
        with rls.bypass():
            asset = get_object_or_404(Asset, pk=asset_id)
        path = storage.local_path(asset.key)
        if path is None or not path.is_file():
            raise Http404
        response = FileResponse(path.open("rb"), content_type=asset.content_type)
        response["Content-Disposition"] = "inline"
        response["X-Content-Type-Options"] = "nosniff"
        return response
