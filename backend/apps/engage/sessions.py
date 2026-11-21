"""Live session state: who may see what, and the one document every client renders.

The server's clock is the only clock. Stage and activity times are stamped here, a
response's `answered_at` decides order, and the state carries `serverTime` so a client
can count down without trusting its own clock.
"""

from collections import defaultdict

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import TENANT_STAFF
from apps.gamification.models import Crew, CrewMembership

from . import media
from .models import Activity, Attendance, Classroom, HuddleNote, Response, Session


def is_host(member) -> bool:
    return member.is_superadmin or member.role in TENANT_STAFF


def may_join(member, classroom: Classroom) -> bool:
    if is_host(member) or classroom.cohort_id is None:
        return True
    return CrewMembership.objects.filter(cohort_id=classroom.cohort_id, member=member).exists()


def visible_classrooms(request):
    rooms = Classroom.objects.filter(tenant=request.tenant).select_related("cohort")
    if is_host(request.user):
        return rooms
    mine = CrewMembership.objects.filter(member=request.user).values("cohort_id")
    return rooms.filter(cohort__isnull=True) | rooms.filter(cohort_id__in=mine)


def require_access(request, session: Session) -> None:
    if not may_join(request.user, session.classroom):
        raise PermissionDenied("This class is for another cohort.")


def crew_of(member, session: Session) -> Crew | None:
    """The member's crew for this session's cohort, or their only crew when the
    classroom is open to the whole tenant."""
    memberships = CrewMembership.objects.filter(member=member).select_related("crew")
    if session.classroom.cohort_id:
        memberships = memberships.filter(cohort_id=session.classroom.cohort_id)
    found = list(memberships[:2])
    return found[0].crew if len(found) == 1 else None


def bump(session: Session, *, identities: list[str] | None = None, ping: bool = True) -> None:
    """Mark the shared state as changed and, once committed, tell the room."""
    Session.objects.filter(pk=session.pk).update(version=F("version") + 1)
    session.refresh_from_db(fields=["version"])
    if ping:
        room, sid, version = session.classroom.room_name, session.pk, session.version
        transaction.on_commit(lambda: media.notify(room, sid, version, identities))


def is_open(activity: Activity, now) -> bool:
    return activity.opens_at <= now < activity.closes_at


def current_activity(session: Session) -> Activity | None:
    """The latest activity of the current block: open, or closed and still on show."""
    return session.activities.filter(block=session.block).order_by("-opens_at").first()


def _name(member) -> str:
    return member.display_name or "Class participant"


def _activity_state(activity: Activity, member, crew: Crew | None, now) -> dict:
    open_now = is_open(activity, now)
    responses = list(activity.responses.all())
    mine = next((r for r in responses if r.member_id == member.pk), None)
    hunt = activity.kind == Activity.Kind.HUNT
    results = None
    if not hunt or not open_now:
        counts: dict[str, int] = defaultdict(int)
        for response in responses:
            counts[response.option] += 1
        results = {
            "total": len(responses),
            "counts": [{"optionId": o["id"], "count": counts[o["id"]]} for o in activity.options],
        }
    my_result = None
    if hunt and mine:
        class_rank = crew_rank = None
        if mine.correct:
            winners = [r for r in responses if r.correct]
            class_rank = winners.index(mine) + 1
            if crew:
                crew_ids = set(crew.memberships.values_list("member_id", flat=True))
                crew_rank = [r for r in winners if r.member_id in crew_ids].index(mine) + 1
        my_result = {
            "correct": bool(mine.correct),
            "crewRank": crew_rank,
            "classRank": class_rank,
            "xp": mine.points,
        }
    return {
        "id": str(activity.pk),
        "kind": activity.kind,
        "prompt": activity.prompt,
        "options": activity.options,
        "opensAt": activity.opens_at.isoformat(),
        "closesAt": activity.closes_at.isoformat(),
        "status": "open" if open_now else "closed",
        "myResponse": (
            {
                "optionId": mine.option,
                "answeredAt": mine.answered_at.isoformat(),
                "elapsedMs": int((mine.answered_at - activity.opens_at).total_seconds() * 1000),
            }
            if mine
            else None
        ),
        "results": results,
        "correctOptionId": activity.correct_option if hunt and not open_now else None,
        "myResult": my_result,
    }


def _points(session: Session) -> dict:
    rows = (
        Response.objects.filter(activity__session=session)
        .values("member_id")
        .annotate(total=Sum("points"))
    )
    return {row["member_id"]: row["total"] or 0 for row in rows}


def _crew_state(session: Session, member, crew: Crew) -> dict:
    points = _points(session)
    crews = Crew.objects.filter(cohort_id=crew.cohort_id).prefetch_related("memberships__member")
    totals = {c.pk: sum(points.get(m.member_id, 0) for m in c.memberships.all()) for c in crews}
    mine = next(c for c in crews if c.pk == crew.pk)
    members = sorted(
        mine.memberships.all(), key=lambda m: (-points.get(m.member_id, 0), _name(m.member))
    )
    return {
        "id": str(crew.pk),
        "name": crew.name,
        # Ties share a rank, like the crew leaderboard.
        "rank": 1 + sum(1 for total in totals.values() if total > totals[crew.pk]),
        "crewCount": len(totals),
        "total": totals[crew.pk],
        "members": [
            {
                "memberId": str(m.member_id),
                "name": _name(m.member),
                "isLead": m.is_lead,
                "points": points.get(m.member_id, 0),
                "isMe": m.member_id == member.pk,
            }
            for m in members
        ],
    }


def state(session: Session, member) -> dict:
    now = timezone.now()
    host = is_host(member)
    crew = crew_of(member, session)
    activity = current_activity(session)
    seat = Attendance.objects.filter(session=session, member=member).first()
    note = (
        HuddleNote.objects.filter(session=session, crew=crew, block=session.block)
        .select_related("updated_by")
        .first()
        if crew
        else None
    )
    hands = []
    if host:
        hands = [
            {
                "memberId": str(a.member_id),
                "name": _name(a.member),
                "raisedAt": a.hand_raised_at.isoformat(),
            }
            for a in Attendance.objects.filter(session=session, hand_raised_at__isnull=False)
            .select_related("member")
            .order_by("hand_raised_at")
        ]
    live = session.status == Session.Status.LIVE
    return {
        "id": str(session.pk),
        "classroomId": str(session.classroom_id),
        "title": session.title,
        "status": session.status,
        "version": session.version,
        "serverTime": now.isoformat(),
        "block": {
            "index": session.block,
            "count": session.block_count,
            "stageIndex": session.stage,
            "stageStartedAt": session.stage_started_at.isoformat(),
            "stages": session.stages,
        },
        "activity": _activity_state(activity, member, crew, now) if activity else None,
        "crew": _crew_state(session, member, crew) if crew else None,
        "huddle": (
            {
                "text": note.text if note else "",
                "updatedAt": note.updated_at.isoformat() if note else None,
                "updatedByName": _name(note.updated_by) if note else None,
                "canEdit": live,
            }
            if crew
            else None
        ),
        "me": {
            "isHost": host,
            "handRaised": bool(seat and seat.hand_raised_at),
            "removed": bool(seat and seat.removed_at),
        },
        "hands": hands,
        "crewMemberIds": (
            [str(pk) for pk in crew.memberships.values_list("member_id", flat=True)] if crew else []
        ),
    }


def heatmap(session: Session) -> dict:
    """Crews against activities: how many answered and, for hunts, how many were right.
    Crew-level only; no individual appears."""
    activities = list(session.activities.all())
    crews = Crew.objects.all()
    if session.classroom.cohort_id:
        crews = crews.filter(cohort_id=session.classroom.cohort_id)
    else:
        seen = Response.objects.filter(activity__session=session).values("member_id")
        crews = crews.filter(memberships__member_id__in=seen).distinct()
    crews = list(crews.filter(tenant=session.tenant).prefetch_related("memberships"))
    answered: dict = defaultdict(dict)
    for response in Response.objects.filter(activity__session=session):
        answered[response.activity_id][response.member_id] = response
    rows = []
    for crew in crews:
        ids = [m.member_id for m in crew.memberships.all()]
        cells = []
        for activity in activities:
            mine = [answered[activity.pk][i] for i in ids if i in answered[activity.pk]]
            hunt = activity.kind == Activity.Kind.HUNT
            correct = sum(1 for r in mine if r.correct) if hunt else None
            # Hunts: share of the crew that found it. Polls: share that took part.
            top = correct if hunt else len(mine)
            cells.append(
                {
                    "activityId": str(activity.pk),
                    "members": len(ids),
                    "responded": len(mine),
                    "correct": correct,
                    "rate": round(top / len(ids), 3) if ids else None,
                }
            )
        rows.append({"crewId": str(crew.pk), "name": crew.name, "cells": cells})
    return {
        "activities": [
            {"id": str(a.pk), "kind": a.kind, "prompt": a.prompt, "block": a.block}
            for a in activities
        ],
        "crews": rows,
    }
