"""Server-side simulator scoring: replay a learner's action log with `forge_sim`.

`forge_sim` is the Rust crate in `rust/` built as a Python module (see rust/README.md).
The game runs the same crate on the device, but its score is never trusted: the game
sends the action log, and the score recorded is the one `replay` computes here.

The module is optional until the wheel is part of the API image. Callers get
`SimUnavailable` (503) when it isn't installed, never an ImportError.
"""

import json

from rest_framework.exceptions import APIException, ValidationError

try:
    import forge_sim
except ImportError:  # the wheel isn't built into this environment
    forge_sim = None


class SimUnavailable(APIException):
    status_code = 503
    default_detail = "Simulator scoring isn't installed on this server."


def _module():
    if forge_sim is None:
        raise SimUnavailable()
    return forge_sim


def rules_version() -> int:
    return _module().RULES_VERSION


def validate_scenario(scenario: dict) -> None:
    """Raise a 400 unless `scenario` is playable under the installed rules."""
    sim = _module()
    try:
        sim.validate_scenario(json.dumps(scenario))
    except sim.ScenarioError as exc:
        raise ValidationError({"scenario": [str(exc)]}) from exc


def replay(scenario: dict, seed: int, actions: list[dict]) -> dict:
    """The outcome of a run, computed here from what the learner did.

    A malformed scenario is a server-side authoring fault and propagates as
    `forge_sim.ScenarioError`. A malformed or impossible action log is the client's
    fault and is a 400.
    """
    sim = _module()
    try:
        return json.loads(sim.replay(json.dumps(scenario), seed, json.dumps(actions)))
    except sim.ActionLogError as exc:
        raise ValidationError({"actions": [str(exc)]}) from exc
