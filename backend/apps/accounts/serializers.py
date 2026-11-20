from rest_framework import serializers

from apps.tenants.models import Tenant

from .models import Member, Role


class TenantSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "status", "branding"]


class MemberSerializer(serializers.ModelSerializer):
    tenantId = serializers.CharField(source="tenant_id", read_only=True, allow_null=True)
    # Alias of `id`, kept for clients that still read `uid`.
    uid = serializers.SerializerMethodField()
    displayName = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = Member
        fields = ["id", "uid", "tenantId", "email", "displayName", "role", "status"]
        read_only_fields = fields

    def get_uid(self, obj: Member) -> str:
        return str(obj.id)


class MeSerializer(serializers.Serializer):
    member = MemberSerializer()
    tenant = TenantSummarySerializer(allow_null=True)
    canAuthor = serializers.BooleanField()


class RoleChangeSerializer(serializers.Serializer):
    # Superadmin is granted out-of-band (manage.py grant_superadmin), never here.
    role = serializers.ChoiceField(choices=[r for r in Role.values if r != Role.SUPERADMIN])
