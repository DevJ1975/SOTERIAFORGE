from datetime import timedelta

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response as ApiResponse
from rest_framework.views import APIView

from apps.accounts.models import Member
from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.gamification.awards import award_xp
from apps.gamification.models import Cohort, CrewMembership, XpSource

from . import media, sessions
from .media import check_configuration, join_credentials
from .models import (
    POLL_POINTS,
    Activity,
    Attendance,
    Classroom,
    HuddleNote,
    Response,
    Session,
    default_stages,
)
from .serializers import (
    ActivityCreateSerializer,
    AdvanceSerializer,
    AttendanceRowSerializer,
    ClassroomSerializer,
    HandSerializer,
    HeatmapSerializer,
    HuddleSerializer,
    JoinSerializer,
    ModerateSerializer,
    RespondSerializer,
    SessionStartSerializer,
    SessionStateSerializer,
)

# A heartbeat arrives every 30 s; a longer gap is time away, not time present.
HEARTBEAT_GAP = 90


class Conflict(APIException):
    status_code = 409
    default_detail = "That is no longer possible."


def tenant_of(request):
    if request.tenant is None:
        raise PermissionDenied("Select a tenant to use classrooms.")
    return request.tenant


def private(payload=None, status=200) -> ApiResponse:
    response = ApiResponse(payload, status=status)
    response["Cache-Control"] = "no-store"
    return response


def live_session(classroom: Classroom) -> Session | None:
    return classroom.sessions.filter(status=Session.Status.LIVE).first()


class ClassroomListView(APIView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsActiveMember()]
        return super().get_permissions()

    @extend_schema(responses=ClassroomSerializer(many=True))
    def get(self, request):
        tenant_of(request)
        rooms = list(sessions.visible_classrooms(request))
        live = {
            room_id: str(session_id)
            for room_id, session_id in Session.objects.filter(
                classroom__in=rooms, status=Session.Status.LIVE
            ).values_list("classroom_id", "id")
        }
        return ApiResponse(ClassroomSerializer(rooms, many=True, context={"live": live}).data)

    @extend_schema(request=ClassroomSerializer, responses={201: ClassroomSerializer})
    def post(self, request):
        body = ClassroomSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        check_configuration()
        cohort_id = body.validated_data.pop("cohort_id", None)
        cohort = (
            get_object_or_404(Cohort, tenant=request.tenant, pk=cohort_id) if cohort_id else None
        )
        with transaction.atomic():
            room = body.save(tenant=request.tenant, created_by=request.user, cohort=cohort)
            record(
                action="engage.classroom.created",
                actor=request.user,
                tenant=request.tenant,
                target=room,
                cohort=str(cohort.pk) if cohort else None,
            )
        return ApiResponse(ClassroomSerializer(room).data, status=201)


class ClassroomJoinView(APIView):
    @extend_schema(request=None, responses=JoinSerializer)
    def post(self, request, classroom_id):
        room = get_object_or_404(Classroom, pk=classroom_id, tenant=tenant_of(request))
        if not sessions.may_join(request.user, room):
            raise PermissionDenied("This class is for another cohort.")
        session = live_session(room)
        if (
            session
            and Attendance.objects.filter(
                session=session, member=request.user, removed_at__isnull=False
            ).exists()
        ):
            raise PermissionDenied("The host removed you from this session.")
        credentials = join_credentials(
            room, request.user, can_screen_share=sessions.is_host(request.user)
        )
        return private({**credentials, "sessionId": str(session.pk) if session else None})


class HostView(APIView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF


def session_for(request, session_id, *, live: bool = False) -> Session:
    session = get_object_or_404(
        Session.objects.select_related("classroom"), pk=session_id, tenant=tenant_of(request)
    )
    sessions.require_access(request, session)
    if live and session.status != Session.Status.LIVE:
        raise Conflict("This session has ended.")
    return session


def state_of(request, session: Session) -> ApiResponse:
    session.refresh_from_db()
    return private(sessions.state(session, request.user))


class SessionStartView(HostView):
    """Start a live session in a classroom. One at a time per classroom."""

    @extend_schema(request=SessionStartSerializer, responses={201: SessionStateSerializer})
    def post(self, request, classroom_id):
        room = get_object_or_404(Classroom, pk=classroom_id, tenant=tenant_of(request))
        body = SessionStartSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            with transaction.atomic():
                session = Session.objects.create(
                    tenant=request.tenant,
                    classroom=room,
                    title=data.get("title") or room.title,
                    started_by=request.user,
                    stages=data.get("stages") or default_stages(),
                    block_count=data["blocks"],
                    stage_started_at=timezone.now(),
                )
                record(
                    action="engage.session.started",
                    actor=request.user,
                    tenant=request.tenant,
                    target=session,
                )
                room_name, sid = room.room_name, session.pk
                transaction.on_commit(lambda: media.notify(room_name, sid, 1))
        except IntegrityError:
            raise Conflict("A session is already live in this classroom.") from None
        return private(sessions.state(session, request.user), status=201)


class SessionAdvanceView(HostView):
    """Move to the next stage (and on to the next block), or jump to a given one."""

    @extend_schema(request=AdvanceSerializer, responses=SessionStateSerializer)
    def post(self, request, session_id):
        body = AdvanceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            session = session_for(request, session_id, live=True)
            block = body.validated_data.get("block", session.block)
            stage = body.validated_data.get("stage")
            if stage is None and "block" not in body.validated_data:
                stage = session.stage + 1
                if stage >= len(session.stages):
                    block, stage = block + 1, 0
            stage = stage or 0
            if block > session.block_count or stage >= len(session.stages):
                raise Conflict("That was the last stage. End the session when you are done.")
            session.block, session.stage = block, stage
            session.stage_started_at = timezone.now()
            session.save(update_fields=["block", "stage", "stage_started_at"])
            sessions.bump(session)
        return state_of(request, session)


class SessionEndView(HostView):
    @extend_schema(request=None, responses=SessionStateSerializer)
    def post(self, request, session_id):
        with transaction.atomic():
            session = session_for(request, session_id)
            if session.status == Session.Status.LIVE:
                now = timezone.now()
                session.status, session.ended_at = Session.Status.ENDED, now
                session.save(update_fields=["status", "ended_at"])
                # An open activity closes with the session.
                session.activities.filter(closes_at__gt=now).update(closes_at=now)
                record(
                    action="engage.session.ended",
                    actor=request.user,
                    tenant=request.tenant,
                    target=session,
                )
                sessions.bump(session)
        return state_of(request, session)


class ActivityCreateView(HostView):
    """Launch a poll or a Threat Hunt. It opens now and closes after `seconds`."""

    @extend_schema(request=ActivityCreateSerializer, responses={201: SessionStateSerializer})
    def post(self, request, session_id):
        body = ActivityCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        hunt = data["kind"] == Activity.Kind.HUNT
        options = [
            {"id": chr(ord("a") + i), "label": o["label"], "detail": o["detail"]}
            for i, o in enumerate(data["options"])
        ]
        with transaction.atomic():
            session = session_for(request, session_id, live=True)
            now = timezone.now()
            if session.activities.filter(closes_at__gt=now).exists():
                raise Conflict("Close the open activity before starting another.")
            Activity.objects.create(
                tenant=request.tenant,
                session=session,
                kind=data["kind"],
                prompt=data["prompt"],
                options=options,
                correct_option=options[data["correctIndex"]]["id"] if hunt else "",
                xp=data["xp"] if hunt else 0,
                block=session.block,
                opens_at=now,
                closes_at=now + timedelta(seconds=data["seconds"]),
                created_by=request.user,
            )
            sessions.bump(session)
        session.refresh_from_db()
        return private(sessions.state(session, request.user), status=201)


class ActivityCloseView(HostView):
    @extend_schema(request=None, responses=SessionStateSerializer)
    def post(self, request, activity_id):
        with transaction.atomic():
            activity = get_object_or_404(
                Activity.objects.select_related("session__classroom"),
                pk=activity_id,
                tenant=tenant_of(request),
            )
            now = timezone.now()
            if activity.closes_at > now:
                activity.closes_at = now
                activity.save(update_fields=["closes_at"])
                sessions.bump(activity.session)
        return state_of(request, activity.session)


class SessionStateView(APIView):
    @extend_schema(responses=SessionStateSerializer)
    def get(self, request, session_id):
        return private(sessions.state(session_for(request, session_id), request.user))


class HeartbeatView(APIView):
    """Attendance: the connected client calls this every 30 seconds."""

    @extend_schema(request=None, responses={204: None})
    def post(self, request, session_id):
        session = session_for(request, session_id, live=True)
        now = timezone.now()
        seat, created = Attendance.objects.get_or_create(
            session=session,
            member=request.user,
            defaults={"tenant": request.tenant, "first_joined_at": now, "last_seen_at": now},
        )
        if seat.removed_at:
            raise PermissionDenied("The host removed you from this session.")
        if not created:
            gap = (now - seat.last_seen_at).total_seconds()
            if 0 < gap <= HEARTBEAT_GAP:
                seat.seconds += int(gap)
            seat.last_seen_at = now
            seat.save(update_fields=["seconds", "last_seen_at"])
        return private(status=204)


class RespondView(APIView):
    """Answer the open poll or Threat Hunt. The server's receipt time is the answer time."""

    @extend_schema(request=RespondSerializer, responses=SessionStateSerializer)
    def post(self, request, activity_id):
        body = RespondSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        option = body.validated_data["optionId"]
        with transaction.atomic():
            activity = get_object_or_404(
                Activity.objects.select_related("session__classroom"),
                pk=activity_id,
                tenant=tenant_of(request),
            )
            session = activity.session
            sessions.require_access(request, session)
            now = timezone.now()
            if option not in {o["id"] for o in activity.options}:
                raise ValidationError({"optionId": ["That is not one of the options."]})
            existing = Response.objects.filter(activity=activity, member=request.user).first()
            if existing is None:
                if not sessions.is_open(activity, now):
                    raise Conflict("This activity has closed.")
                hunt = activity.kind == Activity.Kind.HUNT
                correct = option == activity.correct_option if hunt else None
                points = (activity.xp if correct else 0) if hunt else POLL_POINTS
                try:
                    with transaction.atomic():
                        answer = Response.objects.create(
                            tenant=request.tenant,
                            activity=activity,
                            member=request.user,
                            option=option,
                            correct=correct,
                            points=points,
                            answered_at=now,
                        )
                except IntegrityError:
                    answer = None  # a double submit: the first answer stands
                if answer and correct and points:
                    award_xp(
                        tenant=request.tenant,
                        member=request.user,
                        amount=points,
                        source=XpSource.ENGAGE_HUNT,
                        source_id=str(activity.pk),
                        now=now,
                        active_day=False,
                    )
                # No ping: every client polls, and a burst of answers must not make
                # the whole room refetch on each one.
                sessions.bump(session, ping=False)
        return state_of(request, session)


class HuddleView(APIView):
    """Your crew's shared notes for the current block."""

    @extend_schema(request=HuddleSerializer, responses=SessionStateSerializer)
    def put(self, request, session_id):
        body = HuddleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            session = session_for(request, session_id, live=True)
            crew = sessions.crew_of(request.user, session)
            if crew is None:
                raise PermissionDenied("Huddle notes belong to a crew, and you are not on one.")
            HuddleNote.objects.update_or_create(
                session=session,
                crew=crew,
                block=session.block,
                defaults={
                    "tenant": request.tenant,
                    "text": body.validated_data["text"],
                    "updated_by": request.user,
                },
            )
            mates = [
                str(pk)
                for pk in crew.memberships.exclude(member=request.user).values_list(
                    "member_id", flat=True
                )
            ]
            sessions.bump(session, identities=mates, ping=bool(mates))
        return state_of(request, session)


class HandView(APIView):
    @extend_schema(request=HandSerializer, responses={204: None})
    def post(self, request, session_id):
        body = HandSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            session = session_for(request, session_id, live=True)
            now = timezone.now()
            seat, _ = Attendance.objects.get_or_create(
                session=session,
                member=request.user,
                defaults={"tenant": request.tenant, "first_joined_at": now, "last_seen_at": now},
            )
            raised = now if body.validated_data["raised"] else None
            if bool(seat.hand_raised_at) != bool(raised):
                seat.hand_raised_at = raised
                seat.save(update_fields=["hand_raised_at"])
                sessions.bump(session)
        return private(status=204)


class ModerateView(HostView):
    """Host controls: mute a microphone, lower a hand, or remove someone for the session."""

    @extend_schema(request=ModerateSerializer, responses={204: None})
    def post(self, request, session_id, member_id):
        body = ModerateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        action = body.validated_data["action"]
        session = session_for(request, session_id, live=True)
        target = get_object_or_404(Member, pk=member_id)
        room = session.classroom.room_name
        if action == "mute":
            media.mute(room, str(target.pk))
        else:
            if action == "remove" and sessions.is_host(target):
                raise PermissionDenied("Hosts cannot be removed.")
            with transaction.atomic():
                now = timezone.now()
                seat, _ = Attendance.objects.get_or_create(
                    session=session,
                    member=target,
                    defaults={
                        "tenant": request.tenant,
                        "first_joined_at": now,
                        "last_seen_at": now,
                    },
                )
                seat.hand_raised_at = None
                if action == "remove":
                    seat.removed_at = now
                seat.save(update_fields=["hand_raised_at", "removed_at"])
                sessions.bump(session)
            if action == "remove":
                # Recorded first: they cannot rejoin even if the media call below fails.
                media.remove(room, str(target.pk))
        record(
            action=f"engage.moderation.{action}",
            actor=request.user,
            tenant=request.tenant,
            target=session,
            member=str(target.pk),
        )
        return private(status=204)


class AttendanceView(HostView):
    @extend_schema(responses=AttendanceRowSerializer(many=True))
    def get(self, request, session_id):
        session = session_for(request, session_id)
        seats = list(session.attendance.select_related("member"))
        crews = dict(
            CrewMembership.objects.filter(member__in=[s.member_id for s in seats])
            .filter(
                **(
                    {"cohort_id": session.classroom.cohort_id}
                    if session.classroom.cohort_id
                    else {}
                )
            )
            .values_list("member_id", "crew__name")
        )
        return private(
            [
                {
                    "memberId": str(seat.member_id),
                    "name": seat.member.display_name or seat.member.email,
                    "crew": crews.get(seat.member_id),
                    "firstJoinedAt": seat.first_joined_at.isoformat(),
                    "lastSeenAt": seat.last_seen_at.isoformat(),
                    "minutes": round(seat.seconds / 60),
                    "removed": bool(seat.removed_at),
                }
                for seat in seats
            ]
        )


class HeatmapView(APIView):
    """The debrief heat map. Staff any time; learners in the debrief stage or afterwards."""

    @extend_schema(responses=HeatmapSerializer)
    def get(self, request, session_id):
        session = session_for(request, session_id)
        if not sessions.is_host(request.user):
            stage = session.stages[session.stage]["key"] if session.stages else ""
            if session.status == Session.Status.LIVE and stage != "debrief":
                raise PermissionDenied("The heat map opens in the debrief.")
        return private(sessions.heatmap(session))
