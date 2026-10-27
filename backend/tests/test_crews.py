"""Cohorts, sections, crews, and the crew-only leaderboard."""

import json
from datetime import UTC, datetime

import pytest

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.gamification.leaderboard import crew_board, rank_crews, window_start
from apps.gamification.models import Cohort, Crew, CrewMembership, Section, XpEvent
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db

# A Wednesday, so daily / weekly windows are unambiguous.
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


def at(day, hour=12, minute=0):
    return datetime(2026, 10, day, hour, minute, tzinfo=UTC)


def as_(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


@pytest.fixture
def staff(lakewood):
    return make_member(lakewood, "teacher", Role.INSTRUCTOR)


@pytest.fixture
def learners(lakewood):
    return [make_member(lakewood, f"u{i}") for i in range(6)]


@pytest.fixture
def cohort(lakewood, staff):
    cohort = Cohort.objects.create(tenant=lakewood, name="Cohort 1", created_by=staff)
    section = Section.objects.create(tenant=lakewood, cohort=cohort, name="Section A")
    cohort.alpha = Crew.objects.create(
        tenant=lakewood, cohort=cohort, section=section, name="Alpha"
    )
    cohort.bravo = Crew.objects.create(
        tenant=lakewood, cohort=cohort, section=section, name="Bravo"
    )
    return cohort


def join(crew, *members, lead=None):
    for m in members:
        CrewMembership.objects.create(
            tenant=crew.tenant, cohort=crew.cohort, crew=crew, member=m, is_lead=m == lead
        )


def xp(member, amount, when=NOW, key=None):
    XpEvent.objects.create(
        tenant=member.tenant,
        member=member,
        amount=amount,
        source="lesson",
        source_id=key or f"{member.pk}-{amount}-{when.isoformat()}",
        created_at=when,
    )


# --- Staff set up cohorts, sections and crews --------------------------------


def test_staff_build_the_structure_and_it_is_audited(staff):
    teacher = as_("teacher")
    made = teacher.post(
        "/api/cohorts",
        {"name": "Fall 2026", "startsOn": "2026-09-01", "endsOn": "2026-12-15"},
        format="json",
    )
    assert made.status_code == 201, made.json()
    cohort_id = made.json()["id"]
    section = teacher.post(
        f"/api/cohorts/{cohort_id}/sections", {"name": "Tue night"}, format="json"
    )
    crew = teacher.post(
        f"/api/sections/{section.json()['id']}/crews", {"name": "Alpha"}, format="json"
    )
    assert crew.status_code == 201
    assert Crew.objects.get().cohort_id == Cohort.objects.get().pk  # denormalized from the section
    actions = set(AuditEntry.objects.values_list("action", flat=True))
    assert {
        "gamification.cohort.created",
        "gamification.section.created",
        "gamification.crew.created",
    } <= actions


def test_learner_gets_403_on_every_management_endpoint(lakewood, cohort, learners):
    learner = as_("u0")
    section = cohort.sections.get()
    for method, url, body in [
        ("get", "/api/cohorts", None),
        ("post", "/api/cohorts", {"name": "X"}),
        ("get", f"/api/cohorts/{cohort.pk}", None),
        ("post", f"/api/cohorts/{cohort.pk}/sections", {"name": "X"}),
        ("post", f"/api/sections/{section.pk}/crews", {"name": "X"}),
        ("put", f"/api/crews/{cohort.alpha.pk}/members", {"memberIds": []}),
    ]:
        response = (
            getattr(learner, method)(url, body, format="json")
            if body
            else getattr(learner, method)(url)
        )
        assert response.status_code == 403, (method, url)


def test_names_must_be_unique_within_their_parent(cohort):
    teacher = as_("teacher")
    assert teacher.post("/api/cohorts", {"name": "Cohort 1"}, format="json").status_code == 400
    assert (
        teacher.post(
            f"/api/cohorts/{cohort.pk}/sections", {"name": "Section A"}, format="json"
        ).status_code
        == 400
    )
    section = cohort.sections.get()
    assert (
        teacher.post(
            f"/api/sections/{section.pk}/crews", {"name": "Alpha"}, format="json"
        ).status_code
        == 400
    )
    # The same names are fine in a different cohort.
    other = Cohort.objects.create(tenant=cohort.tenant, name="Cohort 2")
    assert (
        teacher.post(
            f"/api/cohorts/{other.pk}/sections", {"name": "Section A"}, format="json"
        ).status_code
        == 201
    )


def test_cohort_dates_must_be_in_order(staff):
    response = as_("teacher").post(
        "/api/cohorts",
        {"name": "Backwards", "startsOn": "2026-12-01", "endsOn": "2026-09-01"},
        format="json",
    )
    assert response.status_code == 400
    assert "endsOn" in response.json()


def test_cohort_detail_lists_crews_and_members_for_staff(cohort, learners):
    join(cohort.alpha, learners[0], learners[1], lead=learners[0])
    tree = as_("teacher").get(f"/api/cohorts/{cohort.pk}").json()
    (section,) = tree["sections"]
    alpha = next(c for c in section["crews"] if c["name"] == "Alpha")
    assert {m["id"]: m["isLead"] for m in alpha["members"]} == {
        str(learners[0].pk): True,
        str(learners[1].pk): False,
    }


# --- Rosters -----------------------------------------------------------------


def put_members(crew, members, leads=()):
    return as_("teacher").put(
        f"/api/crews/{crew.pk}/members",
        {"memberIds": [str(m.pk) for m in members], "leadIds": [str(m.pk) for m in leads]},
        format="json",
    )


def test_staff_set_a_crews_roster_with_leads(cohort, learners):
    response = put_members(cohort.alpha, learners[:3], leads=learners[:1])
    assert response.status_code == 200
    rows = CrewMembership.objects.filter(crew=cohort.alpha)
    assert rows.count() == 3 and rows.filter(is_lead=True).get().member == learners[0]
    assert AuditEntry.objects.get(action="gamification.crew.members.set").details["members"] == 3


def test_setting_a_roster_replaces_the_old_one(cohort, learners):
    put_members(cohort.alpha, learners[:3])
    put_members(cohort.alpha, learners[2:4])
    assert set(
        CrewMembership.objects.filter(crew=cohort.alpha).values_list("member", flat=True)
    ) == {
        learners[2].pk,
        learners[3].pk,
    }


def test_a_member_moves_crews_inside_the_cohort_never_in_two(cohort, learners):
    put_members(cohort.alpha, learners[:2])
    put_members(cohort.bravo, learners[1:3])  # learners[1] moves to Bravo
    assert CrewMembership.objects.get(member=learners[1]).crew == cohort.bravo
    assert CrewMembership.objects.filter(member=learners[1]).count() == 1


def test_only_learners_of_this_tenant_can_be_crew_members(cohort, learners, lakewood, acme):
    outsider = make_member(acme, "outsider")
    teacher_too = make_member(lakewood, "ta", Role.INSTRUCTOR)
    for bad in (outsider, teacher_too):
        assert put_members(cohort.alpha, [learners[0], bad]).status_code == 400
    assert not CrewMembership.objects.exists()


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"memberIds": "x"},
        {"memberIds": ["not-a-uuid"]},
        {"memberIds": ["00000000-0000-0000-0000-000000000001"] * 2},
    ],
)
def test_malformed_rosters_are_400(cohort, body):
    response = as_("teacher").put(f"/api/crews/{cohort.alpha.pk}/members", body, format="json")
    assert response.status_code == 400


def test_a_lead_must_be_on_the_roster(cohort, learners):
    response = put_members(cohort.alpha, learners[:2], leads=[learners[4]])
    assert response.status_code == 400


def test_staff_cannot_touch_another_tenants_cohort(cohort, acme):
    make_member(acme, "acme-teacher", Role.INSTRUCTOR)
    outsider = client_for(sign_in("acme-teacher"), tenant="acme")
    assert outsider.get(f"/api/cohorts/{cohort.pk}").status_code == 404
    assert outsider.get("/api/cohorts").json() == []
    assert (
        outsider.put(
            f"/api/crews/{cohort.alpha.pk}/members", {"memberIds": []}, format="json"
        ).status_code
        == 404
    )


# --- Ranking -----------------------------------------------------------------


def test_crews_are_ranked_by_average_xp_per_member(cohort, learners):
    join(cohort.alpha, learners[0], learners[1])  # 100 + 0 = 100 / 2 = 50
    join(cohort.bravo, learners[2])  # 60 / 1 = 60: smaller crew, higher average
    xp(learners[0], 100)
    xp(learners[2], 60)
    rows = rank_crews(cohort, "allTime", NOW)
    assert [(r["name"], r["rank"], r["score"], r["totalXp"], r["memberCount"]) for r in rows] == [
        ("Bravo", 1, 60, 60, 1),
        ("Alpha", 2, 50, 100, 2),
    ]


def test_scores_round_half_up_like_math_round(cohort, learners):
    join(cohort.alpha, learners[0], learners[1])
    xp(learners[0], 25)  # 25 / 2 = 12.5 -> 13
    assert rank_crews(cohort, "allTime", NOW)[0]["score"] == 13


def test_tied_crews_share_a_rank_and_the_next_rank_skips(cohort, learners, lakewood):
    third = Crew.objects.create(
        tenant=lakewood, cohort=cohort, section=cohort.sections.get(), name="Charlie"
    )
    join(cohort.alpha, learners[0])
    join(cohort.bravo, learners[1])
    join(third, learners[2])
    xp(learners[0], 50)
    xp(learners[1], 50)
    xp(learners[2], 10)
    assert [(r["name"], r["rank"]) for r in rank_crews(cohort, "allTime", NOW)] == [
        ("Alpha", 1),
        ("Bravo", 1),
        ("Charlie", 3),
    ]


def test_a_crew_with_no_members_scores_zero_without_crashing(cohort):
    rows = rank_crews(cohort, "weekly", NOW)
    assert [r["score"] for r in rows] == [0, 0]


def test_windows_are_utc_days_and_iso_weeks(cohort, learners):
    join(cohort.alpha, learners[0])
    xp(learners[0], 1, at(28, 0, 0))  # Wednesday 00:00:00 UTC: today
    xp(learners[0], 10, at(27, 23, 59))  # Tuesday night: this week, not today
    xp(learners[0], 100, at(26, 0, 0))  # Monday 00:00:00: first moment of the week
    xp(learners[0], 1000, at(25, 23, 59))  # Sunday night: last week
    xp(learners[0], 10_000, at(1))  # long ago
    totals = {p: rank_crews(cohort, p, NOW)[0]["totalXp"] for p in ("daily", "weekly", "allTime")}
    assert totals == {"daily": 1, "weekly": 111, "allTime": 11_111}


def test_window_starts(cohort):
    assert window_start("daily", NOW) == at(28, 0, 0)
    assert window_start("weekly", NOW) == at(26, 0, 0)
    assert window_start("allTime", NOW) is None


def test_xp_does_not_leak_between_cohorts(cohort, learners, lakewood):
    other = Cohort.objects.create(tenant=lakewood, name="Cohort 2")
    section = Section.objects.create(tenant=lakewood, cohort=other, name="S")
    elsewhere = Crew.objects.create(tenant=lakewood, cohort=other, section=section, name="Alpha")
    join(cohort.alpha, learners[0])
    join(elsewhere, learners[1])
    xp(learners[0], 40)
    xp(learners[1], 900)
    assert rank_crews(cohort, "allTime", NOW)[0]["totalXp"] == 40
    assert rank_crews(other, "allTime", NOW)[0]["totalXp"] == 900


def test_a_member_in_two_cohorts_counts_in_each_for_the_same_xp(cohort, learners, lakewood):
    other = Cohort.objects.create(tenant=lakewood, name="Cohort 2")
    section = Section.objects.create(tenant=lakewood, cohort=other, name="S")
    again = Crew.objects.create(tenant=lakewood, cohort=other, section=section, name="Alpha")
    join(cohort.alpha, learners[0])
    join(again, learners[0])
    xp(learners[0], 40)
    assert rank_crews(cohort, "allTime", NOW)[0]["totalXp"] == 40
    assert rank_crews(other, "allTime", NOW)[0]["totalXp"] == 40


# --- The API a learner sees --------------------------------------------------


def test_board_marks_my_crew_and_never_names_a_learner(cohort, learners):
    join(cohort.alpha, learners[0], learners[1])
    join(cohort.bravo, learners[2])
    xp(learners[0], 70)
    xp(learners[2], 90)
    response = as_("u0").get("/api/leaderboard/crews?period=allTime")
    assert response.status_code == 200
    board = response.json()
    assert board["scoring"] == "average_xp_per_member"
    assert board["cohort"]["name"] == "Cohort 1"
    assert [(c["name"], c["mine"]) for c in board["crews"]] == [("Bravo", False), ("Alpha", True)]
    # Privacy: crews only. No member id, email, uid or name anywhere in the payload.
    text = json.dumps(board)
    for member in learners:
        for secret in (str(member.pk), member.email, member.firebase_uid):
            assert secret not in text
    assert set(board["crews"][0]) == {
        "rank",
        "crewId",
        "name",
        "score",
        "totalXp",
        "memberCount",
        "mine",
    }


def test_default_period_is_weekly_and_bad_periods_are_rejected(cohort, learners):
    join(cohort.alpha, learners[0])
    assert as_("u0").get("/api/leaderboard/crews").json()["period"] == "weekly"
    assert as_("u0").get("/api/leaderboard/crews?period=yearly").status_code == 400


def test_a_learner_without_a_crew_gets_an_empty_board(learners):
    board = as_("u0").get("/api/leaderboard/crews").json()
    assert board["cohort"] is None and board["crews"] == []


def test_learners_cannot_peek_at_another_cohort_but_staff_can(cohort, learners):
    join(cohort.alpha, learners[0])
    xp(learners[0], 30)
    assert as_("u1").get(f"/api/leaderboard/crews?cohort={cohort.pk}").status_code == 403
    staff_view = as_("teacher").get(f"/api/leaderboard/crews?period=allTime&cohort={cohort.pk}")
    assert staff_view.status_code == 200
    assert {c["name"]: c["totalXp"] for c in staff_view.json()["crews"]} == {
        "Alpha": 30,
        "Bravo": 0,
    }
    assert not any(c["mine"] for c in staff_view.json()["crews"])


def test_staff_cannot_view_another_tenants_cohort_board(cohort, acme):
    make_member(acme, "acme-teacher", Role.INSTRUCTOR)
    outsider = client_for(sign_in("acme-teacher"), tenant="acme")
    assert outsider.get(f"/api/leaderboard/crews?cohort={cohort.pk}").status_code == 404


def test_the_board_uses_my_most_recent_cohort(cohort, learners, lakewood):
    old = Cohort.objects.create(tenant=lakewood, name="Spring", starts_on=at(1).date())
    cohort.starts_on = at(20).date()
    cohort.save()
    section = Section.objects.create(tenant=lakewood, cohort=old, name="S")
    old_crew = Crew.objects.create(tenant=lakewood, cohort=old, section=section, name="Old crew")
    join(old_crew, learners[0])
    join(cohort.alpha, learners[0])
    assert crew_board(learners[0], "allTime", now=NOW)["cohort"]["name"] == "Cohort 1"


def test_score_card_shows_my_crew_and_its_rank(cohort, learners):
    join(cohort.alpha, learners[0], lead=learners[0])
    join(cohort.bravo, learners[1])
    xp(learners[0], 40)
    xp(learners[1], 90)
    crew = as_("u0").get("/api/me/progress").json()["crew"]
    assert crew["name"] == "Alpha" and crew["isLead"] is True
    assert (crew["rank"], crew["score"], crew["cohort"]) == (2, 40, "Cohort 1")
