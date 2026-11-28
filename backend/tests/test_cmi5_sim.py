"""Simulator lessons: the server replays the action log and its score is the one kept.

Skipped where the forge_sim wheel isn't built (rust/README.md).
"""

# ruff: noqa: F811 (the imported `lesson` fixture is requested by name)

import json
from pathlib import Path

import pytest

from apps.audit.models import AuditEntry
from apps.games import sim
from apps.learning.models import LessonProgress
from apps.standards.cmi5 import COMPLETED, FAILED, INITIALIZED, PASSED
from apps.standards.models import AuSession, AuStatement, Scenario
from tests.test_cmi5 import as_, au, fetch, launch, lesson, send, statement  # noqa: F401

pytest.importorskip("forge_sim")
pytestmark = pytest.mark.django_db

# The file the Unity drill is built against: one scenario, two readers.
SCENARIO = json.loads(
    (
        Path(__file__).parents[2] / "games/forge-unity/Assets/Drill/lockout-drill.scenario.json"
    ).read_text()
)
STEPS = [step["id"] for step in SCENARIO["steps"]]
LOG = "https://soteriaforge.com/xapi/extensions/action-log"
REPLAY = "https://soteriaforge.com/xapi/extensions/replay"


def scenario_url(lesson):
    return f"/api/standards/lessons/{lesson.pk}/scenario"


@pytest.fixture
def sim_lesson(lesson):
    assert as_("teacher").put(scenario_url(lesson), SCENARIO, format="json").status_code == 200
    return lesson


def started(lesson):
    launched = launch(lesson).data
    client = au(fetch(launched).data["auth-token"])
    assert send(client, statement(launched, INITIALIZED)).status_code == 200
    return launched, client


def judged(launched, verb, steps, *, scaled):
    actions = [{"t": i * 1000, "step": step} for i, step in enumerate(steps)]
    return statement(
        launched, verb, result={"score": {"scaled": scaled}, "extensions": {LOG: actions}}
    )


def completed(lesson):
    return LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).first()


def test_staff_attach_a_validated_scenario_to_an_au_lesson(lesson):
    url = scenario_url(lesson)
    assert as_("teacher").get(url).status_code == 404
    assert as_("learner").put(url, SCENARIO, format="json").status_code == 403
    looped = {**SCENARIO, "steps": [{"id": "a", "points": 1, "after": ["a"]}]}
    assert as_("teacher").put(url, looped, format="json").status_code == 400
    assert as_("teacher").put(url, [SCENARIO], format="json").status_code == 400
    assert as_("teacher").put(url, SCENARIO, format="json").status_code == 200
    assert as_("teacher").get(url).data == SCENARIO
    assert AuditEntry.objects.filter(action="standards.scenario.saved").count() == 1
    video = lesson.module.lessons.filter(content_type="video").first()
    assert as_("teacher").put(scenario_url(video), SCENARIO, format="json").status_code == 409
    assert as_("teacher").delete(url).status_code == 204
    assert not Scenario.objects.exists()


def test_the_launch_data_carries_the_scenario_and_a_seed(sim_lesson):
    launched, client = started(sim_lesson)
    data = client.get("/api/standards/xapi/activities/state", {"stateId": "LMS.LaunchData"}).data
    assert data["moveOn"] == "Passed"
    parameters = json.loads(data["launchParameters"])
    session = AuSession.objects.get(pk=launched["id"])
    assert parameters == {
        "scenario": SCENARIO,
        "seed": str(session.seed),
        "rulesVersion": sim.rules_version(),
        "actionLogExtension": LOG,
    }
    # A scenario edited mid-run doesn't change what this run is scored against.
    Scenario.objects.update(data={**SCENARIO, "passScore": 100})
    assert AuSession.objects.get(pk=launched["id"]).scenario == SCENARIO


def test_a_replayed_pass_completes_the_lesson_with_the_servers_score(sim_lesson):
    launched, client = started(sim_lesson)
    # One step too early costs 20 points: the replay says 80, and that is recorded.
    steps = ["shutdown", *STEPS]
    assert send(client, judged(launched, PASSED, steps, scaled=0.8)).status_code == 200
    assert completed(sim_lesson).score == 80
    session = as_("learner").get(f"/api/standards/cmi5/sessions/{launched['id']}").data
    assert (session["success"], session["score"]) == (True, 80)
    assert session["completion"]["firstCompletion"] is True
    outcome = AuSession.objects.get(pk=launched["id"]).outcome
    assert outcome["violations"][0]["step"] == "shutdown"
    replay = AuStatement.objects.get(verb=PASSED).payload["result"]["extensions"][REPLAY]
    assert replay["mismatch"] is False
    assert not AuditEntry.objects.filter(action="standards.cmi5.score_mismatch").exists()
    assert send(client, judged(launched, PASSED, STEPS, scaled=1)).status_code == 409


def test_a_tampered_score_is_discarded_and_audited(sim_lesson):
    launched, client = started(sim_lesson)
    # The client claims a perfect pass; its own log shows two steps never done.
    forged = judged(launched, PASSED, STEPS[:4], scaled=1)
    assert send(client, forged).status_code == 200
    assert completed(sim_lesson) is None
    session = as_("learner").get(f"/api/standards/cmi5/sessions/{launched['id']}").data
    assert (session["success"], session["score"], session["completion"]) == (False, 60, None)
    # The stored statement says what happened, not what was claimed.
    stored = AuStatement.objects.get(statement_id=forged["id"])
    assert stored.verb == FAILED and stored.payload["verb"]["id"] == FAILED
    assert stored.payload["result"]["success"] is False
    assert stored.payload["result"]["score"] == {"scaled": 0.6}
    assert stored.payload["result"]["extensions"][REPLAY]["claimed"] == {
        "passed": True,
        "score": 100,
    }
    entry = AuditEntry.objects.get(action="standards.cmi5.score_mismatch")
    assert entry.details["replayed"] == {"passed": False, "score": 60}
    # Sending the same statement again is still a retry, not a second verdict.
    assert send(client, forged).status_code == 200
    assert AuditEntry.objects.filter(action="standards.cmi5.score_mismatch").count() == 1


def test_a_pass_the_client_called_a_fail_still_counts(sim_lesson):
    launched, client = started(sim_lesson)
    assert send(client, judged(launched, FAILED, STEPS, scaled=0.1)).status_code == 200
    assert completed(sim_lesson).score == 100
    assert AuStatement.objects.filter(verb=PASSED).count() == 1


def test_no_log_no_verdict_and_completed_alone_completes_nothing(sim_lesson):
    launched, client = started(sim_lesson)
    assert send(client, statement(launched, COMPLETED, scaled=1)).status_code == 200
    assert completed(sim_lesson) is None
    assert send(client, statement(launched, PASSED, scaled=1)).status_code == 400
    smuggled = judged(launched, PASSED, STEPS, scaled=1)
    smuggled["result"]["extensions"][LOG][0]["score"] = 100
    assert send(client, smuggled).status_code == 400
    unknown = judged(launched, PASSED, ["teleport"], scaled=1)
    assert send(client, unknown).status_code == 400
    assert completed(sim_lesson) is None
    assert AuSession.objects.get(pk=launched["id"]).success is None
    # A rejected verdict doesn't use up the session's one judgement.
    assert send(client, judged(launched, PASSED, STEPS, scaled=1)).status_code == 200
    assert completed(sim_lesson).score == 100


def test_without_the_rules_a_simulator_lesson_does_not_launch(sim_lesson, monkeypatch):
    monkeypatch.setattr(sim, "forge_sim", None)
    assert launch(sim_lesson).status_code == 503
