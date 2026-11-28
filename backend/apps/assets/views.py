"""File uploads for lessons: staff upload, any member of the tenant gets a signed read URL."""

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_serializer
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.learning.access import acting_tenant
from apps.standards import storage
from apps.tenants import rls

from .models import Asset
from .service import (
    MAX_UPLOAD_BYTES,
    asset_json,
    check_content_type,
    check_filename,
    check_size,
    guess_type,
    register,
    store,
)

URL_TTL_SECONDS = 900
LOCAL_URL_SALT = "assets.local-content"


class AssetSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    assetRef = serializers.CharField()
    filename = serializers.CharField()
    contentType = serializers.CharField()
    size = serializers.IntegerField()


@extend_schema_serializer(component_name="AssetUpload")
class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class AssetUrlSerializer(serializers.Serializer):
    url = serializers.URLField()
    expiresIn = serializers.IntegerField()


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
        check_size(upload.size, MAX_UPLOAD_BYTES)
        filename = check_filename(upload.name or "")
        content_type = check_content_type(upload.content_type or guess_type(filename))
        asset_id, key = store(tenant.id, upload.file, content_type)
        asset = register(
            tenant=tenant,
            member=request.user,
            asset_id=asset_id,
            key=key,
            filename=filename,
            content_type=content_type,
            size=upload.size,
            action="assets.asset.uploaded",
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
