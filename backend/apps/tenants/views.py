from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants import rls

from .models import Tenant

TENANT_HEADER = "HTTP_X_FORGE_TENANT"


class BrandingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "branding"]
        read_only_fields = fields


class TenantBrandingView(APIView):
    """A tenant's name and branding, so the sign-in page can be themed before anyone signs in.

    Public by design (it is what the login screen shows) and limited to those three
    fields of an active tenant. The tenant is named by `X-Forge-Tenant`, resolved from
    the host.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=BrandingSerializer)
    def get(self, request):
        tenant_id = request.META.get(TENANT_HEADER, "").strip()
        with rls.bypass():
            tenant = Tenant.objects.filter(pk=tenant_id, status=Tenant.Status.ACTIVE).first()
        # One answer for "no such tenant" and "not active": don't reveal which tenants exist.
        if not tenant_id or tenant is None:
            raise NotFound("No such tenant.")
        response = Response(BrandingSerializer(tenant).data)
        response["Cache-Control"] = "public, max-age=300"
        return response
