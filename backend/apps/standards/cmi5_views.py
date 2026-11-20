"""HTTP surface for cmi5 / Unity lessons. Two callers, two kinds of credential:

- the learner app (a signed-in member) launches a lesson and polls its session;
- the Assignable Unit (holding only a session token) fetches its token, reads
  `LMS.LaunchData` and sends xAPI statements.
"""

import json

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import authentication, exceptions
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.learning.access import Conflict, acting_tenant, get_lesson, require_enrollment
from apps.learning.models import AU_CONTENT_TYPES, PublishStatus
from apps.learning.progress import lock_enrollment
from apps.tenants import rls

from . import cmi5
from .models import AuSession
from .serializers import AuLaunchSerializer, AuSessionSerializer
from .views import PrivateView


# --- learner app -----------------------------------------------------------------
class AuLaunchView(PrivateView):
    @extend_schema(request=None, responses={201: AuLaunchSerializer})
    def post(self, request, lesson_id):
        lesson = get_lesson(request, lesson_id)
        if lesson.content_type not in AU_CONTENT_TYPES or hasattr(lesson, "binding"):
            raise Conflict("This lesson is not a cmi5 or Unity lesson.")
        if lesson.module.course.status != PublishStatus.PUBLISHED:
            raise Conflict("Publish this course before launching.")
        au_url = cmi5.au_url_for(lesson, request)
        enrollment = require_enrollment(request, lesson.module.course)
        with transaction.atomic():
            enrollment = lock_enrollment(enrollment)
            session, secret = cmi5.start(enrollment=enrollment, lesson=lesson, au_url=au_url)
        return Response(
            {
                "id": str(session.pk),
                "auUrl": au_url,
                "endpoint": request.build_absolute_uri("/api/standards/xapi/"),
                "fetch": request.build_absolute_uri(
                    f"/api/standards/cmi5/fetch/{session.pk}/{secret}"
                ),
                "actor": json.dumps(cmi5.actor_for(request.user.pk)),
                "registration": str(enrollment.pk),
                "activityId": cmi5.activity_id(lesson.pk),
                "expiresAt": session.expires_at.isoformat(),
            },
            status=201,
        )


class AuSessionView(PrivateView):
    """What the AU has reported so far, so the learner app can show the result."""

    @extend_schema(responses=AuSessionSerializer)
    def get(self, request, session_id):
        session = get_object_or_404(
            AuSession,
            pk=session_id,
            tenant=acting_tenant(request),
            enrollment__member=request.user,
        )
        return Response(
            {
                "id": str(session.pk),
                "active": not session.revoked and session.terminated_at is None,
                "initialized": session.initialized_at is not None,
                "completed": session.completed_at is not None,
                "success": session.success,
                "terminated": session.terminated_at is not None,
                "score": session.score,
                "completion": session.completion,
            }
        )


# --- assignable unit ---------------------------------------------------------------
class AuAuthentication(authentication.BaseAuthentication):
    """Session token from the fetch URL → the learner, scoped to the session's tenant."""

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        scheme, _sep, token = header.partition(" ")
        parsed = cmi5.read_token(token.strip()) if scheme in {"Basic", "Bearer"} else None
        if parsed is None:
            raise exceptions.AuthenticationFailed("Invalid session token.")
        session_id, secret = parsed
        with rls.bypass():
            session = cmi5.with_relations(AuSession.objects).filter(pk=session_id).first()
        if session is None or not cmi5.token_matches(session, secret):
            raise exceptions.AuthenticationFailed("Invalid session token.")
        # The tenant always comes from the session row, never from the request.
        rls.set_tenant(session.tenant_id)
        request.tenant = session.tenant
        return session.enrollment.member, session

    def authenticate_header(self, request):
        return "Bearer"


class HasAuSession(BasePermission):
    def has_permission(self, request, view) -> bool:
        return isinstance(request.auth, AuSession)


class AuView(PrivateView):
    authentication_classes = [AuAuthentication]
    permission_classes = [HasAuSession]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not request.headers.get("X-Experience-API-Version", "").startswith("1.0"):
            raise ValidationError("Send X-Experience-API-Version: 1.0.3.")
        cmi5.require_live(request.auth)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["X-Experience-API-Version"] = cmi5.XAPI_VERSION
        return response


@extend_schema(exclude=True)
class FetchView(PrivateView):
    """cmi5 fetch URL: one POST exchanges it for the session's auth token.

    Errors use the cmi5 body (`error-code` 1 = already used, 2 = security error,
    3 = expired) together with a non-200 status.
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request, session_id, secret):
        def refuse(code: str, text: str):
            return Response({"error-code": code, "error-text": text}, status=403)

        with rls.bypass():
            found = cmi5.with_relations(AuSession.objects).filter(pk=session_id).first()
        if found is None or not cmi5.fetch_matches(found, secret):
            return refuse("2", "Unknown fetch URL.")
        rls.set_tenant(found.tenant_id)
        with transaction.atomic():
            session = cmi5.with_relations(AuSession.objects.select_for_update(of=("self",))).get(
                pk=found.pk
            )
            if session.fetch_used_at is not None:
                return refuse("1", "This fetch URL was already used.")
            try:
                cmi5.require_live(session)
            except exceptions.PermissionDenied:
                return refuse("3", "This launch has expired. Relaunch the lesson.")
            return Response({"auth-token": cmi5.issue_token(session)})


@extend_schema(exclude=True)
class StatementsView(AuView):
    def _store(self, request, statements, statement_id=None):
        with transaction.atomic():
            lock_enrollment(request.auth.enrollment)
            session = cmi5.with_relations(AuSession.objects.select_for_update(of=("self",))).get(
                pk=request.auth.pk
            )
            return cmi5.record(cmi5.require_live(session), statements, statement_id)

    def post(self, request):
        body = request.data
        return Response(self._store(request, body if isinstance(body, list) else [body]))

    def put(self, request):
        statement_id = request.query_params.get("statementId")
        if not statement_id:
            raise ValidationError("statementId is required.")
        self._store(request, [request.data], statement_id)
        return Response(status=204)


@extend_schema(exclude=True)
class StateView(AuView):
    """Only the read-only `LMS.LaunchData` document for now; AU-written state
    (saves) arrives with the State API in a later phase."""

    def get(self, request):
        if request.query_params.get("stateId") != cmi5.LAUNCH_DATA:
            raise exceptions.NotFound("No such state document.")
        return Response(cmi5.launch_data(request.auth))
