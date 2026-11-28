"""Tenant administration: branding (tenant admins) and the tenant list (superadmins).

Ports of the `updateBranding`, `provisionTenant` and `setTenantStatus` Cloud Functions.
"""

import logging
import re

from django.db import IntegrityError, transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import tokens
from apps.accounts.emails import send_link_email
from apps.accounts.models import Member, OneTimeToken, Role
from apps.accounts.permissions import IsActiveMember
from apps.audit.models import record
from apps.gamification.badges import ensure_default_badges

from .library import LIBRARY_TENANT_ID
from .models import Tenant, tenant_slug

log = logging.getLogger(__name__)

# Branding becomes CSS custom properties in every app, so values are held to shapes
# that can't break out of a declaration (fullmatch, so no trailing newline slips by).
TOKEN_NAME = re.compile(r"--[a-z0-9-]{1,64}")
TOKEN_VALUE = re.compile(r"[#(),.%\w -]{1,100}")
FONT_FAMILY = re.compile(r"[\w ,'\"-]{1,200}")


@extend_schema_serializer(component_name="BrandingUpdate")
class BrandingSerializer(serializers.Serializer):
    logoUrl = serializers.URLField(max_length=2048, required=False, allow_blank=True)
    faviconUrl = serializers.URLField(max_length=2048, required=False, allow_blank=True)
    colors = serializers.DictField(child=serializers.CharField(max_length=100), required=False)
    fontFamily = serializers.CharField(max_length=200, required=False, allow_blank=True)
    emailFromName = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_logoUrl(self, value):
        return self._https(value)

    def validate_faviconUrl(self, value):
        return self._https(value)

    @staticmethod
    def _https(value: str) -> str:
        if value and not value.startswith("https://"):
            raise serializers.ValidationError("Use an https:// URL.")
        return value

    def validate_colors(self, value):
        if len(value) > 50:
            raise serializers.ValidationError("At most 50 color tokens.")
        for name, token in value.items():
            if not TOKEN_NAME.fullmatch(name) or not TOKEN_VALUE.fullmatch(token):
                raise serializers.ValidationError(f"Invalid color token {name!r}.")
        return value

    def validate_fontFamily(self, value):
        if value and not FONT_FAMILY.fullmatch(value):
            raise serializers.ValidationError("Invalid font family.")
        return value

    def to_internal_value(self, data):
        # Drop blanks so the stored branding only holds what was set.
        return {k: v for k, v in super().to_internal_value(data).items() if v not in ("", None)}


class TenantSerializer(serializers.ModelSerializer):
    customDomain = serializers.CharField(source="custom_domain", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Tenant
        fields = ["id", "name", "status", "plan", "customDomain", "branding", "createdAt"]
        read_only_fields = fields


class TenantBrandingUpdateView(APIView):
    """Replace a tenant's branding: its tenant admins, or a superadmin."""

    permission_classes = [IsActiveMember]

    @extend_schema(request=BrandingSerializer, responses=TenantSerializer)
    def put(self, request, tenant_id):
        user = request.user
        if not user.is_superadmin and not (
            user.role == Role.TENANT_ADMIN and user.tenant_id == tenant_id
        ):
            raise PermissionDenied("Only this tenant's admins can change its branding.")
        body = BrandingSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            tenant = get_object_or_404(Tenant.objects.select_for_update(), pk=tenant_id)
            tenant.branding = {"colors": {}, **body.validated_data}
            tenant.save(update_fields=["branding", "updated_at"])
            record(action="tenant.branding.set", actor=user, tenant=tenant, target=tenant)
        return Response(TenantSerializer(tenant).data)


class SuperadminView(APIView):
    permission_classes = [IsActiveMember]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not request.user.is_superadmin:
            raise PermissionDenied("Superadmin only.")


# Hosts the platform itself uses under the root domain, so no tenant may take them.
# `staging` is the staging environment's root (staging.<root>). Mirrors
# RESERVED_SUBDOMAINS in libs/shared/src/lib/constants.ts.
RESERVED_TENANT_IDS = frozenset(
    {"www", "app", "admin", "api", "static", "assets", "staging", "content", LIBRARY_TENANT_ID}
)


class ProvisionSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=63, validators=[tenant_slug])
    name = serializers.CharField(max_length=200)
    plan = serializers.CharField(max_length=50, default="starter")
    adminEmail = serializers.EmailField(required=False)

    def validate_id(self, value):
        if value in RESERVED_TENANT_IDS:
            raise ValidationError("This id is reserved for a platform host.")
        return value


class TenantUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    plan = serializers.CharField(max_length=50, required=False)
    status = serializers.ChoiceField(choices=Tenant.Status.choices, required=False)
    customDomain = serializers.CharField(max_length=253, required=False, allow_blank=True)


class TenantListView(SuperadminView):
    """Every tenant (GET), or provision a new one (POST), optionally inviting its first admin."""

    @extend_schema(responses=TenantSerializer(many=True))
    def get(self, request):
        return Response(
            TenantSerializer(Tenant.objects.exclude(pk=LIBRARY_TENANT_ID), many=True).data
        )

    @extend_schema(request=ProvisionSerializer, responses={201: TenantSerializer})
    def post(self, request):
        body = ProvisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with transaction.atomic():
            if Tenant.objects.filter(pk=data["id"]).exists():
                raise ValidationError({"id": ["A tenant with this id already exists."]})
            tenant = Tenant.objects.create(
                id=data["id"],
                name=data["name"],
                plan=data["plan"],
                status=Tenant.Status.ACTIVE,
                branding={"colors": {}},
            )
            record(action="tenant.provisioned", actor=request.user, tenant=tenant, target=tenant)
            ensure_default_badges(tenant)
            admin, raw = None, None
            if data.get("adminEmail"):
                try:
                    with transaction.atomic():
                        admin = Member.objects.create(
                            tenant=tenant,
                            email=data["adminEmail"],
                            role=Role.TENANT_ADMIN,
                            status=Member.Status.INVITED,
                        )
                except IntegrityError as exc:
                    raise ValidationError({"adminEmail": ["Already has an account."]}) from exc
                raw = tokens.issue_one_time(admin, OneTimeToken.Purpose.INVITE)
                record(
                    action="member.invited",
                    actor=request.user,
                    tenant=tenant,
                    target=admin,
                    role=admin.role,
                )
        if admin is not None:
            try:
                send_link_email(admin, OneTimeToken.Purpose.INVITE, raw)
            except Exception:  # they can ask for a new link from the sign-in page
                log.exception("Could not send invite email")
        return Response(TenantSerializer(tenant).data, status=status.HTTP_201_CREATED)


class TenantDetailView(SuperadminView):
    """Rename a tenant, change its plan or domain, or move it through its lifecycle."""

    @extend_schema(request=TenantUpdateSerializer, responses=TenantSerializer)
    def patch(self, request, tenant_id):
        if tenant_id == LIBRARY_TENANT_ID:  # reserved platform tenant, not manageable here
            raise Http404
        body = TenantUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        fields = {
            "name": "name",
            "plan": "plan",
            "status": "status",
            "customDomain": "custom_domain",
        }
        with transaction.atomic():
            tenant = get_object_or_404(Tenant.objects.select_for_update(), pk=tenant_id)
            changed = {}
            for key, attr in fields.items():
                if key in data and getattr(tenant, attr) != data[key]:
                    changed[attr] = {"old": getattr(tenant, attr), "new": data[key]}
                    setattr(tenant, attr, data[key])
            if changed:
                tenant.save(update_fields=[*changed, "updated_at"])
                record(
                    action="tenant.updated",
                    actor=request.user,
                    tenant=tenant,
                    target=tenant,
                    changes=changed,
                )
        return Response(TenantSerializer(tenant).data)
