"""XP awards through the real lesson-completion API, and the XP ledger's guarantees."""

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.gamification.awards import award_xp, total_xp
from apps.gamification.models import ActivityDay, XpEvent
from conftest import client_for, make_member, sign_in
from tests.content import FAILING, PASSING, build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "learner"),
        "peer": make_member(lakewood, "peer"),
    }


@pytest.fixture
def content(lakewood, people):
    return build_course(lakewood, people["teacher"])


def as_(uid):
    return client_for(sign_in(uid))


@pytest.fixture
def learner(content):
    client = as_("learner")
    client.post(f"/api/courses/{content.course.pk}/enroll")
    return client


def complete(client, lesson):
    return client.post(f"/api/lessons/{lesson.pk}/complete").json()


# --- Awards on first completion ---------------------------------------------


def test_first_completion_pays_the_lessons_reward_once(content, learner, people):
    first = complete(learner, content.video)
    assert first["award"]["awarded"] == 20
    assert total_xp(people["learner"]) == 20
    replay = complete(learner, content.video)
    assert replay["award"] is None
    assert total_xp(people["learner"]) == 20
    assert XpEvent.objects.count() == 1


def test_the_event_names_what_it_was_for_and_is_audited(content, learner, people):
    complete(learner, content.video)
    event = XpEvent.objects.get()
    assert (event.source, event.source_id, event.amount) == ("lesson", str(content.video.pk), 20)
    assert event.tenant_id == "lakewood" and event.member == people["learner"]
    entry = AuditEntry.objects.get(action="gamification.xp.awarded")
    assert entry.details["amount"] == 20 and entry.actor == people["learner"]


def test_authors_set_the_reward_per_lesson(content, learner, people):
    as_("teacher").patch(f"/api/lessons/{content.video.pk}", {"xpReward": 50}, format="json")
    assert complete(learner, content.video)["award"]["awarded"] == 50


@pytest.mark.parametrize("bad", [-1, 1001, "lots", None])
def test_invalid_rewards_are_rejected(content, bad):
    response = as_("teacher").patch(
        f"/api/lessons/{content.video.pk}", {"xpReward": bad}, format="json"
    )
    assert response.status_code == 400


def test_a_zero_reward_lesson_still_counts_for_the_streak(content, learner, people):
    content.video.xp_reward = 0
    content.video.save()
    award = complete(learner, content.video)["award"]
    assert award["awarded"] == 0 and award["streakDays"] == 1
    assert not XpEvent.objects.exists()
    assert ActivityDay.objects.filter(member=people["learner"]).count() == 1


def test_graded_quiz_pays_ten_xp_per_point_on_a_pass_only(content, learner, people):
    content.graded.max_attempts = None  # allow the replay below
    content.graded.save()
    failed = learner.post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": FAILING}, format="json"
    ).json()
    assert failed["completion"] is None and total_xp(people["learner"]) == 0
    passed = learner.post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": PASSING}, format="json"
    ).json()
    assert passed["completion"]["award"]["awarded"] == 30  # 20 + 1 point x 10
    again = learner.post(
        f"/api/lessons/{content.exam.pk}/attempts", {"responses": PASSING}, format="json"
    ).json()
    assert again["completion"]["award"] is None
    assert total_xp(people["learner"]) == 30


def test_knowledge_check_pays_for_first_try_points_only(content, learner, people):
    def check(question, option):
        return learner.post(
            f"/api/lessons/{content.checked.pk}/check",
            {"questionId": question, "selectedOptionIds": [option]},
            format="json",
        ).json()

    check("q1", "b")  # wrong first
    check("q1", "a")  # solved on the retry: no XP for this one
    done = check("q2", "f")  # right first time
    assert done["completion"]["award"]["awarded"] == 30  # 20 + 1 first-try point x 10


def test_two_learners_are_paid_separately(content, learner, people):
    other = as_("peer")
    other.post(f"/api/courses/{content.course.pk}/enroll")
    complete(learner, content.video)
    complete(other, content.video)
    assert total_xp(people["learner"]) == total_xp(people["peer"]) == 20


# --- Levels ------------------------------------------------------------------


def test_crossing_a_threshold_reports_the_level_up_once(content, learner, people, lakewood):
    XpEvent.objects.create(
        tenant=lakewood, member=people["learner"], amount=270, source="lesson", source_id="seed"
    )
    up = complete(learner, content.video)["award"]
    assert (up["level"], up["leveledUp"], up["totalXp"]) == (2, True, 290)
    same = award_xp(
        tenant=lakewood, member=people["learner"], amount=5, source="lesson", source_id="more"
    )
    assert (same.level, same.leveled_up) == (2, False)


# --- Streaks -----------------------------------------------------------------


def seed_days(member, tenant, *offsets):
    today = timezone.now().date()
    for n in offsets:
        ActivityDay.objects.create(tenant=tenant, member=member, day=today - timedelta(days=n))


def test_consecutive_days_extend_the_streak(content, learner, people, lakewood):
    seed_days(people["learner"], lakewood, 1, 2)
    award = complete(learner, content.video)["award"]
    assert (award["streakDays"], award["streakExtended"]) == (3, True)


def test_a_missed_day_restarts_the_streak_at_one(content, learner, people, lakewood):
    seed_days(people["learner"], lakewood, 3, 4, 5)
    award = complete(learner, content.video)["award"]
    assert (award["streakDays"], award["streakExtended"]) == (1, True)


def test_a_second_lesson_the_same_day_does_not_extend_it_again(content, learner, people):
    complete(learner, content.video)
    content.checked.quiz = None
    content.checked.save()
    second = complete(learner, content.checked)["award"]
    assert (second["streakDays"], second["streakExtended"]) == (1, False)
    assert ActivityDay.objects.filter(member=people["learner"]).count() == 1


# --- The ledger --------------------------------------------------------------


def test_xp_can_never_be_negative_in_the_database(lakewood, people):
    with pytest.raises(IntegrityError), transaction.atomic():
        XpEvent.objects.create(
            tenant=lakewood, member=people["learner"], amount=-5, source="lesson", source_id="x"
        )


def test_award_xp_clamps_a_negative_amount_to_nothing(lakewood, people):
    result = award_xp(
        tenant=lakewood, member=people["learner"], amount=-50, source="lesson", source_id="neg"
    )
    assert result.awarded == 0 and result.total_xp == 0
    assert not XpEvent.objects.exists()


def test_the_same_source_cannot_be_paid_twice(lakewood, people):
    kwargs = dict(tenant=lakewood, member=people["learner"], source="lesson", source_id="once")
    first = award_xp(amount=40, **kwargs)
    second = award_xp(amount=40, **kwargs)
    assert (first.awarded, second.awarded) == (40, 0)
    assert total_xp(people["learner"]) == 40


def test_a_duplicate_does_not_poison_the_callers_transaction(lakewood, people):
    kwargs = dict(tenant=lakewood, member=people["learner"], source="lesson", source_id="dup")
    with transaction.atomic():
        award_xp(amount=10, **kwargs)
        award_xp(amount=10, **kwargs)  # hits the unique key inside a savepoint
        award_xp(amount=5, **{**kwargs, "source_id": "other"})
    assert total_xp(people["learner"]) == 15


def test_history_cannot_be_rewritten(lakewood, people):
    event = XpEvent.objects.create(
        tenant=lakewood, member=people["learner"], amount=10, source="lesson", source_id="h"
    )
    with pytest.raises(Exception), transaction.atomic():  # noqa: B017 (db error type varies)
        XpEvent.objects.filter(pk=event.pk).update(amount=9999)
    with pytest.raises(Exception), transaction.atomic():  # noqa: B017
        XpEvent.objects.filter(pk=event.pk).delete()
    assert XpEvent.objects.get().amount == 10


def test_xp_is_invisible_across_tenants(lakewood, acme, people):
    from apps.tenants import rls

    other = make_member(acme, "outsider")
    XpEvent.objects.create(
        tenant=lakewood, member=people["learner"], amount=10, source="lesson", source_id="a"
    )
    XpEvent.objects.create(tenant=acme, member=other, amount=99, source="lesson", source_id="b")
    rls.set_bypass(False)
    rls.set_tenant("lakewood")
    assert list(XpEvent.objects.values_list("amount", flat=True)) == [10]
    rls.set_tenant("acme")
    assert list(XpEvent.objects.values_list("amount", flat=True)) == [99]


# --- Score card --------------------------------------------------------------


def test_score_card_shows_my_numbers(content, learner, people, lakewood):
    seed_days(people["learner"], lakewood, 1)
    complete(learner, content.video)
    card = learner.get("/api/me/progress").json()
    assert (card["totalXp"], card["todayXp"], card["level"]) == (20, 20, 1)
    assert card["streakDays"] == 2
    assert len(card["strip"]) == 14 and card["strip"][-1] and card["strip"][-2]
    assert sum(card["strip"]) == 2
    assert card["crew"] is None


def test_score_card_is_private_to_the_learner(content, learner, people):
    other = as_("peer")
    other.post(f"/api/courses/{content.course.pk}/enroll")
    complete(learner, content.video)
    assert other.get("/api/me/progress").json()["totalXp"] == 0


def test_score_card_needs_sign_in(content):
    assert client_for().get("/api/me/progress").status_code == 401
