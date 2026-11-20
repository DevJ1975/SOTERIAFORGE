"""Signed badge credentials: the holder's export, and the public pages a verifier reads.

The public endpoints take no sign-in on purpose: a credential is only useful if an
employer can check it. They expose what the credential itself states (badge,
organization, date, a salted hash of the holder's email) and are addressed by the
award's random id, which only the holder can hand out.
"""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants import rls
from apps.tenants.models import Tenant

from . import credentials
from .models import Badge, BadgeAward


class SignedCredentialSerializer(serializers.Serializer):
    credential = serializers.DictField()
    jwt = serializers.CharField()
    verifyUrl = serializers.CharField()


class VerifyRequestSerializer(serializers.Serializer):
    jwt = serializers.CharField(max_length=20_000)


class VerifyResultSerializer(serializers.Serializer):
    valid = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True)
    credential = serializers.DictField(allow_null=True)


def _awards():
    return BadgeAward.objects.select_related("badge", "tenant", "member")


def _signed(award: BadgeAward) -> dict:
    document = credentials.credential(award)
    return {"credential": document, "jwt": credentials.sign(award), "verifyUrl": document["id"]}


class MyCredentialView(APIView):
    """Your signed credential for a badge you earned."""

    @extend_schema(responses=SignedCredentialSerializer)
    def get(self, request, badge_id):
        award = get_object_or_404(_awards(), member=request.user, badge_id=badge_id)
        response = Response(_signed(award))
        response["Cache-Control"] = "no-store"
        return response


class _Public(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]


class JwksView(_Public):
    @extend_schema(responses={200: serializers.DictField()})
    def get(self, request):
        return Response(credentials.jwks())


class IssuerView(_Public):
    @extend_schema(responses={200: serializers.DictField()})
    def get(self, request, tenant_id):
        with rls.bypass():
            tenant = get_object_or_404(Tenant, pk=tenant_id)
        return Response(credentials.issuer_profile(tenant))


class AchievementView(_Public):
    @extend_schema(responses={200: serializers.DictField()})
    def get(self, request, badge_id):
        with rls.bypass():
            badge = get_object_or_404(Badge, pk=badge_id)
        return Response({"@context": credentials.CONTEXT, **credentials.achievement(badge)})


class CredentialView(_Public):
    """The signed credential for one award, by its id."""

    @extend_schema(responses=SignedCredentialSerializer)
    def get(self, request, award_id):
        with rls.bypass():
            award = get_object_or_404(_awards(), pk=award_id)
            return Response(_signed(award))


class VerifyView(_Public):
    """Check a credential: signed by this server, and the award still stands as stated."""

    @extend_schema(request=VerifyRequestSerializer, responses=VerifyResultSerializer)
    def post(self, request):
        body = VerifyRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        claims = credentials.read(body.validated_data["jwt"].strip())
        if claims is None:
            return Response(_invalid("The signature isn't valid for this issuer."))
        award_id = str(claims.get("jti", "")).rsplit("/", 1)[-1]
        with rls.bypass():
            try:
                award = _awards().filter(pk=award_id).first()
            except (ValueError, TypeError):
                award = None
            if award is None:
                return Response(_invalid("This award no longer exists."))
            current = credentials.credential(award)
        if any(claims.get(k) != v for k, v in current.items()):
            # Genuinely signed, but the record has changed since (e.g. the badge was renamed).
            return Response(_invalid("The credential doesn't match the current record."))
        return Response({"valid": True, "reason": None, "credential": current})


def _invalid(reason: str) -> dict:
    return {"valid": False, "reason": reason, "credential": None}
