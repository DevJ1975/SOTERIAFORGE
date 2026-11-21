"""Forge Engage live sessions: cohort access, block bar, polls, Threat Hunt, crews,
huddle notes, hands, moderation, attendance and the debrief heat map."""

from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from django.utils import timezone

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry
from apps.engage import media
from apps.engage.models import Activity, Attendance, Classroom, Response, Session
from apps.gamification.models import (
    ActivityDay,
    Cohort,
    Crew,
    CrewMembership,
    Section,
    XpEvent,
)
from apps.tenants import rls
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db
API = "/api/engage"


@pytest.fixture(autouse=True)
def media_stub(settings, monkeypatch):
    settings.LIVEKIT_URL = "wss://media.example.com"
    settings.LIVEKIT_API_URL = "https://media.example.com"
    settings.LIVEKIT_API_KEY = "test-key"
    settings.LIVEKIT_API_SECRET = "classroom-test-secret-at-least-32-characters"
    calls = {"pings": [], "muted": [], "removed": []}
    monkeypatch.setattr("apps.engage.media.ensure_room", AsyncMock())
    monkeypatch.setattr(
        media, "notify", lambda room, sid, version, ids=None: calls["pings"].append((version, ids))
    )
    monkeypatch.setattr(media, "mute", lambda room, who: calls["muted"].append(who))
    monkeypatch.setattr(media, "remove", lambda room, who: calls["removed"].append(who))
    return calls


@pytest.fixture
def klass(lakewood, django_capture_on_commit_callbacks):
    """A cohort of two crews (Alpha: ann, bo; Bravo: cy), an outsider, and a classroom."""
    teacher = make_member(lakewood, "teacher", Role.INSTRUCTOR)
    cohort = Cohort.objects.create(tenant=lakewood, name="Cohort 1")
    section = Section.objects.create(tenant=lakewood, cohort=cohort, name="A")
    crews = {}
    for crew_name, uids in {"Alpha": ["ann", "bo"], "Bravo": ["cy"]}.items():
        crew = Crew.objects.create(tenant=lakewood, cohort=cohort, section=section, name=crew_name)
        crews[crew_name] = crew
        for i, uid in enumerate(uids):
            CrewMembership.objects.create(
                tenant=lakewood,
                cohort=cohort,
                crew=crew,
                member=make_member(lakewood, uid),
                is_lead=i == 0,
            )
    make_member(lakewood, "outsider")
    for person in Member.objects.filter(tenant=lakewood):
        person.display_name = person.email.split("@")[0]
        person.save(update_fields=["display_name"])
    room = Classroom.objects.create(
        tenant=lakewood, created_by=teacher, title="Lab day", cohort=cohort
    )
    return {"room": room, "cohort": cohort, "crews": crews}


def as_(uid):
    return client_for(sign_in(uid))


def start(klass, **body):
    response = as_("teacher").post(
        f"{API}/classrooms/{klass['room'].pk}/sessions", body, format="json"
    )
    assert response.status_code == 201, response.content
    return response.json()


def state(sid, uid):
    return as_(uid).get(f"{API}/sessions/{sid}/state").json()


def launch(sid, kind="hunt", **extra):
    body = {
        "kind": kind,
        "prompt": "Find the real attack.",
        "options": [{"label": f"Ticket {n}", "detail": "x"} for n in range(1, 5)],
        **({"correctIndex": 2} if kind == "hunt" else {}),
        **extra,
    }
    response = as_("teacher").post(f"{API}/sessions/{sid}/activities", body, format="json")
    assert response.status_code == 201, response.content
    return response.json()["activity"]


def respond(aid, uid, option):
    return as_(uid).post(f"{API}/activities/{aid}/respond", {"optionId": option}, format="json")


# --- Cohort access -----------------------------------------------------------
def test_only_the_cohort_and_staff_see_and_join_a_cohort_classroom(klass, lakewood):
    room = klass["room"]
    open_room = Classroom.objects.create(
        tenant=lakewood, created_by=room.created_by, title="Open house"
    )
    listed = lambda uid: {r["title"] for r in as_(uid).get(f"{API}/classrooms").json()}  # noqa: E731
    assert listed("ann") == listed("teacher") == {"Lab day", "Open house"}
    assert listed("outsider") == {"Open house"}
    join = lambda uid, r=room: as_(uid).post(f"{API}/classrooms/{r.pk}/join")  # noqa: E731
    assert join("ann").status_code == 200 and join("ann").json()["sessionId"] is None
    assert join("outsider").status_code == 403
    assert join("outsider", open_room).status_code == 200
    row = next(r for r in as_("ann").get(f"{API}/classrooms").json() if r["title"] == "Lab day")
    assert row["cohortName"] == "Cohort 1" and row["liveSessionId"] is None


def test_staff_create_a_cohort_classroom_and_learners_cannot_host(klass):
    made = as_("teacher").post(
        f"{API}/classrooms", {"title": "Week 2", "cohortId": str(klass["cohort"].pk)}, format="json"
    )
    assert made.status_code == 201 and made.json()["cohortName"] == "Cohort 1"
    assert as_("ann").post(f"{API}/classrooms/{klass['room'].pk}/sessions").status_code == 403


# --- Session and block bar ---------------------------------------------------
def test_a_session_runs_the_block_bar_on_the_servers_clock(
    klass, media_stub, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        first = start(klass)
    assert first["status"] == "live" and first["me"]["isHost"] is True
    assert [s["key"] for s in first["block"]["stages"]] == [
        "teach",
        "hunt",
        "huddle",
        "report",
        "debrief",
    ]
    assert (first["block"]["index"], first["block"]["count"], first["block"]["stageIndex"]) == (
        1,
        4,
        0,
    )
    sid = first["id"]
    assert as_("teacher").post(f"{API}/classrooms/{klass['room'].pk}/sessions").status_code == 409
    row = next(r for r in as_("ann").get(f"{API}/classrooms").json() if r["title"] == "Lab day")
    assert row["liveSessionId"] == sid
    assert as_("ann").post(f"{API}/classrooms/{klass['room'].pk}/join").json()["sessionId"] == sid

    advance = lambda **b: as_("teacher").post(f"{API}/sessions/{sid}/advance", b, format="json")  # noqa: E731
    with django_capture_on_commit_callbacks(execute=True):
        second = advance().json()
    assert second["block"]["stageIndex"] == 1 and second["version"] == first["version"] + 1
    assert second["block"]["stageStartedAt"] > first["block"]["stageStartedAt"]
    assert media_stub["pings"][-1] == (second["version"], None)
    for _ in range(4):
        last = advance().json()
    assert (last["block"]["index"], last["block"]["stageIndex"]) == (2, 0)
    assert advance(block=4, stage=4).json()["block"]["index"] == 4
    assert advance().status_code == 409  # nothing after the last stage
    assert as_("ann").post(f"{API}/sessions/{sid}/advance").status_code == 403
    assert state(sid, "outsider").get("detail") == "This class is for another cohort."

    ended = as_("teacher").post(f"{API}/sessions/{sid}/end").json()
    assert ended["status"] == "ended"
    assert advance().status_code == 409
    assert AuditEntry.objects.filter(action__startswith="engage.session.").count() == 2
    start(klass)  # a new session can start once the last one has ended


# --- Threat Hunt -------------------------------------------------------------
def test_threat_hunt_hides_the_answer_ranks_by_server_time_and_pays_once(klass):
    sid = start(klass)["id"]
    hunt = launch(sid, xp=40)
    assert hunt["kind"] == "hunt" and hunt["status"] == "open"
    seen = state(sid, "ann")["activity"]
    assert seen["correctOptionId"] is None and seen["results"] is None
    assert "correct" not in str(seen["options"])

    assert respond(hunt["id"], "cy", "c").status_code == 200
    assert respond(hunt["id"], "bo", "a").status_code == 200
    mine = respond(hunt["id"], "ann", "c").json()["activity"]
    assert mine["myResponse"]["optionId"] == "c" and mine["myResponse"]["elapsedMs"] >= 0
    # cy was first in class; ann is the first right answer in her own crew.
    assert mine["myResult"] == {"correct": True, "crewRank": 1, "classRank": 2, "xp": 40}
    wrong = state(sid, "bo")["activity"]["myResult"]
    assert wrong == {"correct": False, "crewRank": None, "classRank": None, "xp": 0}

    # The first answer stands; changing it or sending it twice does nothing.
    assert respond(hunt["id"], "ann", "a").json()["activity"]["myResponse"]["optionId"] == "c"
    assert Response.objects.filter(activity_id=hunt["id"]).count() == 3
    assert respond(hunt["id"], "ann", "z").status_code == 400
    assert respond(hunt["id"], "outsider", "c").status_code == 403

    events = XpEvent.objects.filter(source="engage_hunt")
    assert sorted(e.amount for e in events) == [40, 40]
    # A live win is XP, not a study day: the streak is for lesson completions.
    assert not ActivityDay.objects.exists()

    closed = as_("teacher").post(f"{API}/activities/{hunt['id']}/close").json()["activity"]
    assert closed["status"] == "closed" and closed["correctOptionId"] == "c"
    assert closed["results"]["total"] == 3
    late = make_late = respond(hunt["id"], "cy", "c")
    assert late.status_code == 200 and make_late.json()["activity"]["myResponse"]["optionId"] == "c"


def test_an_answer_after_the_clock_runs_out_is_refused(klass):
    sid = start(klass)["id"]
    hunt = launch(sid, seconds=10)
    Activity.objects.filter(pk=hunt["id"]).update(closes_at=timezone.now() - timedelta(seconds=1))
    assert respond(hunt["id"], "ann", "c").status_code == 409
    assert state(sid, "ann")["activity"]["status"] == "closed"
    assert not XpEvent.objects.exists()


def test_one_activity_at_a_time_and_validation(klass):
    sid = start(klass)["id"]
    launch(sid)
    post = lambda body: as_("teacher").post(f"{API}/sessions/{sid}/activities", body, format="json")  # noqa: E731
    options = [{"label": "A"}, {"label": "B"}]
    assert post({"kind": "poll", "prompt": "Q?", "options": options}).status_code == 409
    as_("teacher").post(f"{API}/activities/{state(sid, 'teacher')['activity']['id']}/close")
    assert post({"kind": "hunt", "prompt": "Q?", "options": options}).status_code == 400
    assert (
        post({"kind": "hunt", "prompt": "Q?", "options": options, "correctIndex": 2}).status_code
        == 400
    )
    assert (
        post({"kind": "poll", "prompt": "Q?", "options": options, "correctIndex": 0}).status_code
        == 400
    )
    assert post({"kind": "poll", "prompt": "Q?", "options": options[:1]}).status_code == 400
    assert as_("ann").post(f"{API}/sessions/{sid}/activities", {}, format="json").status_code == 403


# --- Polls and the crew panel ------------------------------------------------
def test_poll_counts_are_live_and_crew_points_stay_inside_the_crew(klass):
    sid = start(klass)["id"]
    hunt = launch(sid, xp=40)
    respond(hunt["id"], "ann", "c")
    respond(hunt["id"], "cy", "c")
    as_("teacher").post(f"{API}/activities/{hunt['id']}/close")
    poll = launch(sid, kind="poll")
    assert poll["results"] == {
        "total": 0,
        "counts": [{"optionId": o, "count": 0} for o in "abcd"],
    }
    respond(poll["id"], "ann", "a")
    respond(poll["id"], "bo", "b")
    seen = state(sid, "cy")["activity"]
    assert seen["results"]["total"] == 2 and seen["correctOptionId"] is None
    assert seen["myResult"] is None

    alpha = state(sid, "ann")["crew"]
    assert (alpha["name"], alpha["total"], alpha["rank"], alpha["crewCount"]) == ("Alpha", 50, 1, 2)
    assert [(m["name"], m["points"], m["isLead"], m["isMe"]) for m in alpha["members"]] == [
        ("ann", 45, True, True),
        ("bo", 5, False, False),
    ]
    bravo = state(sid, "cy")
    assert bravo["crew"]["rank"] == 2 and bravo["crew"]["total"] == 40
    # Another crew's members and scores never appear.
    assert "ann" not in str(bravo["crew"]) and sorted(bravo["crewMemberIds"]) == sorted(
        str(pk) for pk in klass["crews"]["Bravo"].memberships.values_list("member_id", flat=True)
    )
    host = state(sid, "teacher")
    assert host["crew"] is None and host["huddle"] is None and host["crewMemberIds"] == []


# --- Huddle notes ------------------------------------------------------------
def test_huddle_notes_are_shared_by_a_crew_per_block(
    klass, media_stub, django_capture_on_commit_callbacks
):
    sid = start(klass)["id"]

    def save(uid, text):
        return as_(uid).put(f"{API}/sessions/{sid}/huddle", {"text": text}, format="json")  # noqa: E731

    with django_capture_on_commit_callbacks(execute=True):
        saved = save("ann", "It was ticket 4474.\n").json()["huddle"]
    assert saved["text"] == "It was ticket 4474.\n" and saved["updatedByName"] == "ann"
    # Only the rest of the crew is pinged.
    bo = CrewMembership.objects.get(member__email="bo@example.com").member_id
    assert media_stub["pings"][-1][1] == [str(bo)]
    assert state(sid, "bo")["huddle"]["text"] == "It was ticket 4474.\n"
    assert state(sid, "cy")["huddle"]["text"] == ""
    assert save("teacher", "x").status_code == 403
    assert save("ann", "x" * 2001).status_code == 400
    as_("teacher").post(f"{API}/sessions/{sid}/advance", {"block": 2}, format="json")
    assert state(sid, "bo")["huddle"]["text"] == ""  # a fresh note for the new block


# --- Hands, moderation, attendance -------------------------------------------
def test_hands_and_host_moderation(klass, media_stub):
    sid = start(klass)["id"]
    ann = CrewMembership.objects.get(member__email="ann@example.com").member

    def hand(uid, raised):
        return as_(uid).post(f"{API}/sessions/{sid}/hand", {"raised": raised}, format="json")  # noqa: E731

    assert hand("ann", True).status_code == 204
    assert state(sid, "ann")["me"]["handRaised"] is True and state(sid, "ann")["hands"] == []
    assert [h["name"] for h in state(sid, "teacher")["hands"]] == ["ann"]

    act = lambda action, who=ann, uid="teacher": as_(uid).post(  # noqa: E731
        f"{API}/sessions/{sid}/participants/{who.pk}/moderate", {"action": action}, format="json"
    )
    assert act("lower_hand").status_code == 204 and state(sid, "teacher")["hands"] == []
    assert act("mute").status_code == 204 and media_stub["muted"] == [str(ann.pk)]
    assert act("mute", uid="bo").status_code == 403

    assert act("remove").status_code == 204 and media_stub["removed"] == [str(ann.pk)]
    assert state(sid, "ann")["me"]["removed"] is True
    assert as_("ann").post(f"{API}/classrooms/{klass['room'].pk}/join").status_code == 403
    assert as_("ann").post(f"{API}/sessions/{sid}/heartbeat").status_code == 403
    assert act("remove", who=klass["room"].created_by).status_code == 403
    assert AuditEntry.objects.filter(action__startswith="engage.moderation.").count() == 3
    # Removal lasts for the session, not for good.
    as_("teacher").post(f"{API}/sessions/{sid}/end")
    assert as_("ann").post(f"{API}/classrooms/{klass['room'].pk}/join").status_code == 200


def test_attendance_counts_time_present_from_heartbeats(klass):
    sid = start(klass)["id"]
    beat = lambda uid="ann": as_(uid).post(f"{API}/sessions/{sid}/heartbeat")  # noqa: E731
    assert beat().status_code == 204
    back = lambda seconds: Attendance.objects.update(  # noqa: E731
        last_seen_at=timezone.now() - timedelta(seconds=seconds)
    )
    back(30)
    beat()
    back(600)  # away for ten minutes: not counted
    beat()
    back(60)
    beat()
    assert 89 <= Attendance.objects.get().seconds <= 92
    rows = as_("teacher").get(f"{API}/sessions/{sid}/attendance").json()
    assert [(r["name"], r["crew"], r["minutes"], r["removed"]) for r in rows] == [
        ("ann", "Alpha", 2, False)
    ]
    assert as_("ann").get(f"{API}/sessions/{sid}/attendance").status_code == 403


# --- Debrief heat map --------------------------------------------------------
def test_heat_map_is_by_crew_and_opens_to_learners_in_the_debrief(klass):
    sid = start(klass)["id"]
    hunt = launch(sid)
    respond(hunt["id"], "ann", "c")
    respond(hunt["id"], "bo", "a")
    as_("teacher").post(f"{API}/activities/{hunt['id']}/close")
    poll = launch(sid, kind="poll")
    respond(poll["id"], "cy", "a")

    grid = as_("teacher").get(f"{API}/sessions/{sid}/heatmap").json()
    assert [a["kind"] for a in grid["activities"]] == ["hunt", "poll"]
    cells = {row["name"]: row["cells"] for row in grid["crews"]}
    assert cells["Alpha"][0] == {
        "activityId": hunt["id"],
        "members": 2,
        "responded": 2,
        "correct": 1,
        "rate": 0.5,
    }
    assert cells["Bravo"][0]["rate"] == 0.0 and cells["Bravo"][1]["rate"] == 1.0
    assert cells["Alpha"][1]["correct"] is None and cells["Alpha"][1]["rate"] == 0.0
    assert "ann" not in str(grid)

    assert as_("ann").get(f"{API}/sessions/{sid}/heatmap").status_code == 403
    as_("teacher").post(f"{API}/sessions/{sid}/advance", {"stage": 4}, format="json")
    assert as_("ann").get(f"{API}/sessions/{sid}/heatmap").status_code == 200
    assert as_("outsider").get(f"{API}/sessions/{sid}/heatmap").status_code == 403


# --- Isolation and load shape ------------------------------------------------
def test_another_tenant_cannot_reach_a_session_and_rls_hides_it(klass, acme):
    sid = start(klass)["id"]
    hunt = launch(sid)
    make_member(acme, "acme-teacher", Role.INSTRUCTOR)
    other = client_for(sign_in("acme-teacher"), tenant="acme")
    assert other.get(f"{API}/sessions/{sid}/state").status_code == 404
    assert other.post(f"{API}/sessions/{sid}/end").status_code == 404
    assert other.post(f"{API}/activities/{hunt['id']}/close").status_code == 404
    rls.set_bypass(False)
    rls.set_tenant("acme")
    assert Session.objects.count() == Activity.objects.count() == 0
    rls.set_tenant("lakewood")
    assert Session.objects.count() == Activity.objects.count() == 1


def test_state_costs_the_same_number_of_queries_for_a_full_room(
    klass, lakewood, django_assert_max_num_queries
):
    """20 learners polling every 5 seconds: the state must not grow a query per person."""
    section = Section.objects.get()
    for c in range(3):
        crew = Crew.objects.create(
            tenant=lakewood, cohort=klass["cohort"], section=section, name=f"Crew {c}"
        )
        for n in range(6):
            CrewMembership.objects.create(
                tenant=lakewood,
                cohort=klass["cohort"],
                crew=crew,
                member=make_member(lakewood, f"m{c}{n}"),
            )
    sid = start(klass)["id"]
    hunt = launch(sid)
    for c in range(3):
        for n in range(6):
            assert respond(hunt["id"], f"m{c}{n}", "c").status_code == 200
    client = as_("m00")
    with django_assert_max_num_queries(25):
        body = client.get(f"{API}/sessions/{sid}/state").json()
    assert body["activity"]["myResult"]["classRank"] == 1 and body["crew"]["crewCount"] == 5
