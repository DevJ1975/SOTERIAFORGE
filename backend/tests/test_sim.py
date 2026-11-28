"""Django calling the Rust rules crate. Skipped where the wheel isn't built (rust/README.md)."""

import pytest
from rest_framework.exceptions import ValidationError

from apps.games import sim

forge_sim = pytest.importorskip("forge_sim")

SCENARIO = {
    "id": "loto-press-01",
    "format": 1,
    "passScore": 80,
    "penaltyPoints": 5,
    "steps": [
        {"id": "notify", "points": 10, "required": True},
        {"id": "shutdown", "points": 10, "required": True, "after": ["notify"]},
        {"id": "isolate", "points": 20, "required": True, "after": ["shutdown"]},
        {"id": "lock-tag", "points": 20, "required": True, "after": ["isolate"]},
        {"id": "bleed-lines", "points": 10, "after": ["lock-tag"]},
        {"id": "block-ram", "points": 10, "after": ["lock-tag"]},
        {"id": "verify-zero", "points": 20, "required": True, "after": ["lock-tag"]},
    ],
    "faults": [
        {"id": "residual-pressure", "requires": ["bleed-lines"]},
        {"id": "raised-ram", "requires": ["block-ram"]},
    ],
}
ALL = [s["id"] for s in SCENARIO["steps"]]


def log(steps):
    return [{"t": i * 1000, "step": step} for i, step in enumerate(steps)]


def test_the_server_scores_the_log_itself():
    outcome = sim.replay(SCENARIO, 7, log(ALL))
    assert outcome["rulesVersion"] == sim.rules_version() == 1
    assert (outcome["score"], outcome["passed"]) == (100, True)
    assert outcome["completedSteps"] == ALL


def test_a_client_cant_claim_a_score_it_didnt_earn():
    # Skipping straight to the end earns nothing, whatever the client says it scored.
    outcome = sim.replay(SCENARIO, 7, log(["verify-zero"]))
    assert (outcome["score"], outcome["passed"]) == (0, False)
    assert outcome["violations"][0]["kind"] == "out_of_order"
    # A log that smuggles in a score field is refused outright.
    with pytest.raises(ValidationError, match="unknown field"):
        sim.replay(SCENARIO, 7, [{"t": 0, "step": "notify", "score": 100}])


def test_an_impossible_log_is_a_client_error():
    with pytest.raises(ValidationError, match="teleport"):
        sim.replay(SCENARIO, 7, log(["notify", "teleport"]))
    with pytest.raises(ValidationError, match="back in time"):
        sim.replay(SCENARIO, 7, [{"t": 5, "step": "notify"}, {"t": 0, "step": "shutdown"}])


def test_the_whole_64_bit_seed_range_is_accepted():
    assert sim.replay(SCENARIO, 2**64 - 1, log(ALL))["passed"] is True
    with pytest.raises(OverflowError):
        sim.replay(SCENARIO, 2**64, log(ALL))


def test_the_same_seed_always_picks_the_same_fault():
    faults = {seed: sim.replay(SCENARIO, seed, [])["faultId"] for seed in range(30)}
    assert faults == {seed: sim.replay(SCENARIO, seed, [])["faultId"] for seed in range(30)}
    assert set(faults.values()) == {"residual-pressure", "raised-ram"}


def test_scenarios_are_checked_before_anyone_plays_them():
    sim.validate_scenario(SCENARIO)
    looped = {**SCENARIO, "steps": [{"id": "a", "points": 1, "after": ["a"]}], "faults": []}
    with pytest.raises(ValidationError, match="loop"):
        sim.validate_scenario(looped)
    # A broken scenario at replay time is our fault, not the learner's: not a 400.
    with pytest.raises(forge_sim.ScenarioError):
        sim.replay(looped, 1, [])


def test_without_the_wheel_callers_get_a_503(monkeypatch):
    monkeypatch.setattr(sim, "forge_sim", None)
    with pytest.raises(sim.SimUnavailable):
        sim.replay(SCENARIO, 1, [])
