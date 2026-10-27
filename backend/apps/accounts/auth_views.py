"""Email + password sign-in handled by Django (replaces Firebase Auth).

All lookups here run before there is a tenant to scope to, so they use `rls.bypass()`
and then only touch the one member being signed in.
"""

import logging
from datetime import timedelta
from functools import cache

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import record
from apps.tenants import rls
from apps.tenants.models import Tenant

from . import tokens
from .authentication import TENANT_HEADER
from .emails import send_link_email
from .models import Member, OneTimeToken

log = logging.getLogger(__name__)

BAD_LOGIN = "Invalid email or password."


@cache
def _dummy_hash() -> str:
    """Checked when no account matches, so a miss costs the same as a wrong password."""
    return make_password("not-a-real-password")


class _Public(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        # Without this DRF reports a failed sign-in as 403; it is a 401.
        return "Bearer"


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)
    tenant = serializers.CharField(required=False, allow_blank=True)
    # Native apps can't use the cookie; they ask for the refresh token in the body.
    client = serializers.ChoiceField(choices=["web", "mobile"], default="web")


class TokenResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    expiresIn = serializers.IntegerField()  # noqa: N815
    refresh = serializers.CharField(required=False)


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        raw,
        max_age=settings.AUTH_REFRESH_TTL,
        httponly=True,
        secure=not settings.DEBUG,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/api/auth/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.AUTH_COOKIE_NAME, path="/api/auth/", samesite=settings.AUTH_COOKIE_SAMESITE
    )


def _tokens_response(member: Member, refresh: str, client: str) -> Response:
    data = {"access": tokens.issue_access(member), "expiresIn": settings.AUTH_ACCESS_TTL}
    if client == "mobile":
        data["refresh"] = refresh
    response = Response(data)
    _set_refresh_cookie(response, refresh)
    return response


def _find_member(email: str, tenant_id: str) -> Member | None:
    """The tenant's member for this email, else a platform-level superadmin."""
    tenant = Tenant.objects.filter(pk=tenant_id).first() if tenant_id else None
    if tenant_id and tenant is None:
        return None
    if tenant is not None:
        member = Member.objects.filter(tenant=tenant, email__iexact=email).first()
        if member is not None:
            return member
    return Member.objects.filter(tenant__isnull=True, email__iexact=email).first()


class LoginView(_Public):
    @extend_schema(request=LoginSerializer, responses=TokenResponseSerializer)
    def post(self, request):
        body = LoginSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        email = body.validated_data["email"]
        tenant_id = (
            body.validated_data.get("tenant") or request.META.get(TENANT_HEADER, "")
        ).strip()

        # Errors are raised after the transaction commits, so a failed attempt still
        # counts toward the lockout.
        refresh = None
        locked_for = 0.0
        with rls.bypass(), transaction.atomic():
            member = _find_member(email, tenant_id)
            now = timezone.now()
            if member is not None and member.locked_until and member.locked_until > now:
                locked_for = (member.locked_until - now).total_seconds()
            else:
                refresh = self._attempt(member, body.validated_data["password"], now)
        if locked_for:
            raise exceptions.Throttled(
                wait=locked_for, detail="Too many failed attempts. Try again later."
            )
        if refresh is None:
            raise exceptions.AuthenticationFailed(BAD_LOGIN)
        return _tokens_response(member, refresh, body.validated_data["client"])

    def _attempt(self, member: Member | None, password: str, now) -> str | None:
        """Check the password; on success reset the counters and return a refresh token."""
        if member is None:
            check_password(password, _dummy_hash())
            return None
        if not member.check_password(password) or member.status == Member.Status.DEACTIVATED:
            self._note_failure(member, now)
            return None
        member.failed_logins = 0
        member.locked_until = None
        if member.status == Member.Status.INVITED:
            member.status = Member.Status.ACTIVE
        member.save(update_fields=["failed_logins", "locked_until", "status", "updated_at"])
        record(action="auth.login", actor=member, tenant=member.tenant, target=member)
        return tokens.issue_refresh(member)

    @staticmethod
    def _note_failure(member: Member, now) -> None:
        member.failed_logins += 1
        if member.failed_logins >= settings.AUTH_LOCKOUT_ATTEMPTS:
            member.locked_until = now + timedelta(seconds=settings.AUTH_LOCKOUT_SECONDS)
            member.failed_logins = 0
        member.save(update_fields=["failed_logins", "locked_until", "updated_at"])
        record(action="auth.login.failed", actor=None, tenant=member.tenant, target=member)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False)
    client = serializers.ChoiceField(choices=["web", "mobile"], default="web")


class RefreshView(_Public):
    """Trade a refresh token (cookie, or body for native apps) for a new pair."""

    @extend_schema(request=RefreshSerializer, responses=TokenResponseSerializer)
    def post(self, request):
        body = RefreshSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        raw = body.validated_data.get("refresh")
        from_cookie = raw is None
        if from_cookie:
            raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
            # A cookie rides along on cross-site requests; a custom header can't be
            # sent cross-site without a CORS preflight, so it proves our own client.
            if not request.META.get("HTTP_X_FORGE_CLIENT"):
                raise exceptions.PermissionDenied("Missing X-Forge-Client header.")
        if not raw:
            raise exceptions.AuthenticationFailed("Signed out.")

        with rls.bypass(), transaction.atomic():
            rotated = tokens.rotate_refresh(raw)
        if rotated is None or rotated[0].status != Member.Status.ACTIVE:
            response = Response({"detail": "Signed out."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_refresh_cookie(response)
            return response
        member, new_refresh = rotated
        return _tokens_response(member, new_refresh, body.validated_data["client"])


class LogoutView(_Public):
    @extend_schema(request=RefreshSerializer, responses={204: None})
    def post(self, request):
        raw = request.data.get("refresh") or request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if raw:
            with rls.bypass():
                tokens.revoke_by_raw(raw)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    tenant = serializers.CharField(required=False, allow_blank=True)


class PasswordResetRequestView(_Public):
    """Always answers 202, so the response never reveals which emails have accounts."""

    @extend_schema(request=PasswordResetRequestSerializer, responses={202: None})
    def post(self, request):
        body = PasswordResetRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        tenant_id = (
            body.validated_data.get("tenant") or request.META.get(TENANT_HEADER, "")
        ).strip()
        with rls.bypass():
            member = _find_member(body.validated_data["email"], tenant_id)
            if member is not None and member.status != Member.Status.DEACTIVATED:
                purpose = (
                    OneTimeToken.Purpose.INVITE
                    if member.status == Member.Status.INVITED and not member.password
                    else OneTimeToken.Purpose.RESET
                )
                raw = tokens.issue_one_time(member, purpose)
                try:
                    send_link_email(member, purpose, raw)
                except Exception:
                    log.exception("Could not send %s email", purpose)
        return Response(status=status.HTTP_202_ACCEPTED)


def _checked_password(value: str, member: Member | None = None) -> str:
    try:
        validate_password(value, user=member)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class PasswordResetConfirmView(_Public):
    """Set a password from an emailed link (reset, or an invited member's first one)."""

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        body = PasswordResetConfirmSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            with rls.bypass(), transaction.atomic():
                link = tokens.consume_one_time(body.validated_data["token"])
                member = link.member
                if member.status == Member.Status.DEACTIVATED:
                    raise tokens.InvalidToken
                member.set_password(_checked_password(body.validated_data["password"], member))
                member.failed_logins = 0
                member.locked_until = None
                if member.status == Member.Status.INVITED:
                    member.status = Member.Status.ACTIVE
                member.save()
                tokens.revoke_all(member)
                record(
                    action="auth.password.set",
                    actor=member,
                    tenant=member.tenant,
                    target=member,
                    via=link.purpose,
                )
        except tokens.InvalidToken as exc:
            raise exceptions.ValidationError(
                {"token": "This link is invalid or has expired."}
            ) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeSerializer(serializers.Serializer):
    current = serializers.CharField(trim_whitespace=False)
    password = serializers.CharField(trim_whitespace=False)


class PasswordChangeView(APIView):
    """A signed-in member changes their own password."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses=TokenResponseSerializer)
    def post(self, request):
        body = PasswordChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        member = request.user
        if not member.check_password(body.validated_data["current"]):
            raise exceptions.ValidationError({"current": "Current password is incorrect."})
        member.set_password(_checked_password(body.validated_data["password"], member))
        with transaction.atomic():
            member.save(update_fields=["password", "updated_at"])
            tokens.revoke_all(member)
            record(
                action="auth.password.changed", actor=member, tenant=request.tenant, target=member
            )
            refresh = tokens.issue_refresh(member)
        # Other sessions end; this one continues on a fresh pair.
        return _tokens_response(member, refresh, "web")
