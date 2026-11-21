"""cmi5 launch sessions and xAPI statement intake for `cmi5` and `unity` lessons.

Contract: docs/unity-cmi5-contract.md. Launch parameters go in, xAPI comes out:

1. The learner app asks for a launch. The server creates an `AuSession` and returns
   the AU URL plus the cmi5 parameters, including a one-time fetch URL.
2. The AU POSTs to the fetch URL once and gets an auth token for this session.
3. The AU sends statements with that token. Actor, registration, session and tenant
   are stamped from the session, never taken from the client.

The lesson completes on `completed` or `passed` (cmi5 moveOn "CompletedOrPassed"),
the same rule the SCORM 2004 path applies to `completion_status`.

A lesson with a simulator scenario is stricter (moveOn "Passed"): `passed` / `failed`
must carry the learner's action log, the server replays it with `forge_sim`, and the
verdict and score recorded are the replay's, whatever the AU claimed.
"""

import base64
import binascii
import hashlib
import json
import math
import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from apps.audit.models import record as audit
from apps.games import sim
from apps.learning.access import Conflict
from apps.learning.models import AU_CONTENT_TYPES, PublishStatus
from apps.learning.progress import complete_lesson, touch

from .models import AuSession, AuStatement

# Paths an AU calls from its own origin (see apps.py for the CORS rule).
AU_PATHS = ("/api/standards/xapi/", "/api/standards/cmi5/fetch/")

XAPI_VERSION = "1.0.3"
MAX_STATEMENT_BYTES = 64_000
MAX_BATCH = 50
MAX_SESSION_STATEMENTS = 5_000
LAUNCH_DATA = "LMS.LaunchData"
MOVE_ON = "CompletedOrPassed"
SIM_MOVE_ON = "Passed"

ADL = "http://adlnet.gov/expapi/verbs/"
INITIALIZED = ADL + "initialized"
COMPLETED = ADL + "completed"
PASSED = ADL + "passed"
FAILED = ADL + "failed"
TERMINATED = ADL + "terminated"
CMI5_VERBS = {INITIALIZED, COMPLETED, PASSED, FAILED, TERMINATED}
# Only the LMS may issue these.
LMS_VERBS = {
    "https://w3id.org/xapi/adl/verbs/abandoned",
    "https://w3id.org/xapi/adl/verbs/waived",
    "https://w3id.org/xapi/adl/verbs/satisfied",
}
SESSION_EXTENSION = "https://w3id.org/xapi/cmi5/context/extensions/sessionid"


class TooManyStatements(APIException):
    status_code = 429
    default_detail = "This launch has sent too many statements. Relaunch the lesson."


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def namespace() -> str:
    return settings.XAPI_ACTIVITY_BASE.rstrip("/")


def tenant_extension() -> str:
    return f"{namespace()}/extensions/tenant"


def action_log_extension() -> str:
    """`result.extensions` key of a `passed` / `failed` statement: the action log."""
    return f"{namespace()}/extensions/action-log"


def replay_extension() -> str:
    """`result.extensions` key the server adds: what its replay of the log found."""
    return f"{namespace()}/extensions/replay"


def actor_for(member_id) -> dict:
    """Pseudonymous: the member id, never a name or email (same shape as events.py)."""
    return {"objectType": "Agent", "account": {"homePage": namespace(), "name": str(member_id)}}


def activity_id(lesson_id) -> str:
    return f"{namespace()}/lessons/{lesson_id}"


def au_url_for(lesson, request) -> str:
    """The lesson's launchable URL, or a 409 explaining why it has none.

    The AU runs scripts in an iframe, so it must not share an origin with the API or
    a Forge app: there it could read the learner's session.
    """
    raw = lesson.external_url or lesson.asset_ref
    url = urlsplit(raw)
    if url.scheme not in {"https", "http"} or not url.netloc or url.username or url.password:
        raise Conflict("This lesson has no launch URL yet.")
    if url.scheme != "https" and not settings.DEBUG:
        raise Conflict("The lesson's launch URL must use https.")
    origin = f"{url.scheme}://{url.netloc}"
    own = {
        request.build_absolute_uri("/").rstrip("/"),
        request.headers.get("Origin", ""),
        *settings.STANDARDS_APP_ORIGINS,
    }
    if origin in own:
        raise Conflict("Host this content on its own origin, not on the app or API.")
    return raw


def scenario_for(lesson) -> dict | None:
    """The lesson's simulator scenario, checked against the installed rules.

    Refused before the learner plays a run that could not be scored: 503 when the
    rules aren't installed, 409 when they no longer accept the scenario.
    """
    scenario = getattr(lesson, "sim_scenario", None)
    if scenario is None:
        return None
    try:
        sim.validate_scenario(scenario.data)
    except ValidationError as error:
        raise Conflict("This lesson's simulator scenario needs fixing.") from error
    return scenario.data


def start(*, enrollment, lesson, au_url: str, scenario: dict | None = None):
    """A new session and its one-time fetch secret. Earlier launches stop working.

    The scenario is copied onto the session with a fresh seed, so the run is replayed
    against what the learner was given even if the lesson's scenario changes.
    """
    AuSession.objects.filter(enrollment=enrollment, lesson=lesson, revoked=False).update(
        revoked=True
    )
    secret = secrets.token_urlsafe(32)
    session = AuSession.objects.create(
        tenant_id=enrollment.tenant_id,
        enrollment=enrollment,
        lesson=lesson,
        au_url=au_url,
        fetch_hash=_hash(secret),
        expires_at=timezone.now() + timedelta(seconds=settings.CMI5_SESSION_TTL),
        scenario=scenario,
        seed=secrets.randbits(63) if scenario is not None else None,
    )
    return session, secret


def require_live(session: AuSession) -> AuSession:
    enrollment = session.enrollment
    if (
        session.revoked
        or session.expires_at <= timezone.now()
        or not enrollment.member.is_active
        or enrollment.tenant.status != "active"
        or enrollment.course.status != PublishStatus.PUBLISHED
        or session.lesson.content_type not in AU_CONTENT_TYPES
        or session.lesson.module.course_id != enrollment.course_id
    ):
        raise PermissionDenied("This launch is no longer active.")
    return session


def with_relations(queryset):
    return queryset.select_related(
        "tenant", "enrollment__member", "enrollment__tenant", "enrollment__course", "lesson__module"
    )


# --- tokens --------------------------------------------------------------------
def issue_token(session: AuSession) -> str:
    """Spend the fetch URL. The token is `base64(session:secret)`, so an AU may send
    it as `Basic` (the cmi5 specification) or `Bearer`."""
    secret = secrets.token_urlsafe(32)
    session.token_hash = _hash(secret)
    session.fetch_used_at = timezone.now()
    session.save(update_fields=["token_hash", "fetch_used_at"])
    return base64.b64encode(f"{session.pk}:{secret}".encode()).decode()


def read_token(token: str) -> tuple[uuid.UUID, str] | None:
    try:
        session_id, sep, secret = base64.b64decode(token, validate=True).decode().partition(":")
        return (uuid.UUID(session_id), secret) if sep and secret else None
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None


def token_matches(session: AuSession, secret: str) -> bool:
    return bool(session.token_hash) and secrets.compare_digest(session.token_hash, _hash(secret))


def fetch_matches(session: AuSession, secret: str) -> bool:
    return secrets.compare_digest(session.fetch_hash, _hash(secret))


# --- launch data -----------------------------------------------------------------
def launch_data(session: AuSession) -> dict:
    """The `LMS.LaunchData` state document an AU reads before `initialized`."""
    data = {
        "contextTemplate": {
            "registration": str(session.enrollment_id),
            "extensions": {
                SESSION_EXTENSION: str(session.pk),
                tenant_extension(): str(session.tenant_id),
            },
        },
        "launchMode": "Normal",
        "moveOn": MOVE_ON,
    }
    if session.scenario is not None:
        data["moveOn"] = SIM_MOVE_ON
        # cmi5 carries AU-specific launch data as one string.
        data["launchParameters"] = json.dumps(
            {
                "scenario": session.scenario,
                # A string: JSON numbers in C# and JavaScript can't carry 64 bits.
                "seed": str(session.seed),
                "rulesVersion": sim.rules_version(),
                "actionLogExtension": action_log_extension(),
            }
        )
    return data


# --- statements -------------------------------------------------------------------
def _digest(statement: dict) -> str:
    try:
        encoded = json.dumps(statement, sort_keys=True, allow_nan=False)
    except (ValueError, TypeError, RecursionError) as error:
        raise ValidationError("Invalid statement JSON.") from error
    if len(encoded.encode()) > MAX_STATEMENT_BYTES or "\\u0000" in encoded:
        raise ValidationError("A statement exceeds 64 KB or contains NUL characters.")
    return hashlib.sha256(encoded.encode()).hexdigest()


def _score(statement: dict) -> int | None:
    """`result.score.scaled` (-1..1) as the 0-100 percentage the learning model stores."""
    result = statement.get("result")
    if result is None:
        return None
    if not isinstance(result, dict):
        raise ValidationError("result must be an object.")
    score = result.get("score")
    if score is None:
        return None
    scaled = score.get("scaled") if isinstance(score, dict) else None
    if (
        isinstance(scaled, bool)
        or not isinstance(scaled, int | float)
        or not math.isfinite(scaled)
        or not -1 <= scaled <= 1
    ):
        raise ValidationError("result.score.scaled must be a number from -1 to 1.")
    return max(0, round(scaled * 100))


def _parse(statement, statement_id: str | None) -> tuple[uuid.UUID, str]:
    if not isinstance(statement, dict):
        raise ValidationError("A statement must be a JSON object.")
    raw_id = statement.get("id", statement_id)
    if statement_id is not None and raw_id != statement_id:
        raise ValidationError("statementId does not match the statement's id.")
    try:
        parsed_id = uuid.UUID(raw_id) if raw_id is not None else uuid.uuid4()
    except (ValueError, TypeError, AttributeError) as error:
        raise ValidationError("A statement id must be a UUID.") from error
    verb = statement.get("verb")
    verb_id = verb.get("id") if isinstance(verb, dict) else None
    if not isinstance(verb_id, str) or not 0 < len(verb_id) <= 300 or ":" not in verb_id:
        raise ValidationError("verb.id must be an IRI.")
    target = statement.get("object")
    if not isinstance(target, dict) or target.get("objectType", "Activity") != "Activity":
        raise ValidationError("object must be an Activity.")
    if not isinstance(target.get("id"), str) or not target["id"]:
        raise ValidationError("object.id is required.")
    context = statement.get("context", {})
    if not isinstance(context, dict) or not isinstance(context.get("extensions", {}), dict):
        raise ValidationError("context must be an object.")
    return parsed_id, verb_id


def _timestamp(statement: dict, now: datetime) -> str:
    raw = statement.get("timestamp")
    if raw is None:
        return now.isoformat()
    try:
        datetime.fromisoformat(raw)
    except (ValueError, TypeError) as error:
        raise ValidationError("timestamp must be an ISO 8601 date-time.") from error
    return raw


def _stamp(session: AuSession, statement: dict, statement_id: uuid.UUID, now: datetime) -> dict:
    """The statement as stored: identity and scope always come from the session."""
    context = dict(statement.get("context", {}))
    context["registration"] = str(session.enrollment_id)
    context["extensions"] = {
        **context.get("extensions", {}),
        SESSION_EXTENSION: str(session.pk),
        tenant_extension(): str(session.tenant_id),
    }
    return {
        **statement,
        "id": str(statement_id),
        "actor": actor_for(session.enrollment.member_id),
        "context": context,
        "timestamp": _timestamp(statement, now),
        "stored": now.isoformat(),
        "version": XAPI_VERSION,
    }


def _judge(session: AuSession, verb: str, statement: dict) -> dict:
    """Score a simulator run from its action log. Returns the statement to store,
    rewritten to the replay's verdict and score."""
    claimed_score = _score(statement)
    result = statement.get("result") or {}
    extensions = result.get("extensions", {})
    actions = extensions.get(action_log_extension()) if isinstance(extensions, dict) else None
    if not isinstance(actions, list):
        raise ValidationError(
            f"'passed' and 'failed' must carry the action log in "
            f"result.extensions[{action_log_extension()!r}]."
        )
    outcome = sim.replay(session.scenario, session.seed, actions)
    claimed = {"passed": verb == PASSED, "score": claimed_score}
    mismatch = claimed["passed"] != outcome["passed"] or (
        claimed_score is not None and claimed_score != outcome["score"]
    )
    session.success = outcome["passed"]
    session.score = outcome["score"]
    session.outcome = outcome
    if mismatch:
        audit(
            action="standards.cmi5.score_mismatch",
            actor=session.enrollment.member,
            tenant=session.tenant,
            target=session,
            lesson=str(session.lesson_id),
            claimed=claimed,
            replayed={"passed": outcome["passed"], "score": outcome["score"]},
        )
    if outcome["passed"]:
        session.completion = complete_lesson(
            session.enrollment, session.lesson, score=session.score
        ).as_json()
    return {
        **statement,
        "verb": {**statement["verb"], "id": PASSED if outcome["passed"] else FAILED},
        "result": {
            **result,
            "success": outcome["passed"],
            "score": {"scaled": outcome["score"] / 100},
            "extensions": {
                **extensions,
                replay_extension(): {
                    "rulesVersion": outcome["rulesVersion"],
                    "passed": outcome["passed"],
                    "score": outcome["score"],
                    "faultId": outcome["faultId"],
                    "claimed": claimed,
                    "mismatch": mismatch,
                },
            },
        },
    }


def _apply_verb(session: AuSession, verb: str, statement: dict, now: datetime) -> dict:
    """Enforce the cmi5 statement order and reflect the outcome into learning.

    Returns the statement to store: as sent, except a simulator verdict (`_judge`).
    """
    if verb in LMS_VERBS:
        raise PermissionDenied("Only the LMS may issue this verb.")
    if session.terminated_at is not None:
        raise Conflict("This session has terminated. Relaunch the lesson.")
    if verb == INITIALIZED:
        if session.initialized_at is not None:
            raise Conflict("This session is already initialized.")
        session.initialized_at = now
        return statement
    if session.initialized_at is None:
        raise Conflict("Send 'initialized' before any other statement.")
    if verb not in CMI5_VERBS:
        return statement  # in-game events: stored, no effect on progress
    if statement["object"]["id"] != activity_id(session.lesson_id):
        raise ValidationError("cmi5 statements must be about the launched activity.")
    score = _score(statement)
    if verb == TERMINATED:
        session.terminated_at = now
        return statement
    if verb == COMPLETED:
        if session.completed_at is not None:
            raise Conflict("This session already reported 'completed'.")
        session.completed_at = now
        if session.scenario is not None:
            return statement  # moveOn "Passed": only a replayed pass completes it
    else:  # passed or failed
        if session.success is not None:
            raise Conflict("This session was already judged.")
        if session.scenario is not None:
            return _judge(session, verb, statement)
        session.success = verb == PASSED
    if score is not None:
        session.score = score
    if verb == FAILED and session.completed_at is None:
        return statement  # a failed attempt alone neither completes nor records a score
    completion = complete_lesson(session.enrollment, session.lesson, score=session.score).as_json()
    first = session.completion or {}
    if first.get("firstCompletion"):
        # `completed` then `passed` are one completion to the learner: keep the award
        # the first of them earned, so the host app can still show it.
        completion.update(firstCompletion=True, award=first.get("award"))
    session.completion = completion
    return statement


def record(session: AuSession, statements: list, statement_id: str | None = None) -> list[str]:
    """Store statements for a locked, live session. Call inside `transaction.atomic()`.

    A statement id seen before with the same content is a retry and changes nothing;
    with different content it is a conflict.
    """
    if not statements or len(statements) > MAX_BATCH:
        raise ValidationError(f"Send between 1 and {MAX_BATCH} statements.")
    now = timezone.now()
    ids = []
    for statement in statements:
        parsed_id, verb = _parse(statement, statement_id)
        digest = _digest(statement)
        existing = AuStatement.objects.filter(
            tenant_id=session.tenant_id, statement_id=parsed_id
        ).first()
        if existing is not None:
            if existing.session_id != session.pk or existing.digest != digest:
                raise Conflict("A different statement with this id already exists.")
            ids.append(str(parsed_id))
            continue
        if session.statement_count >= MAX_SESSION_STATEMENTS:
            raise TooManyStatements()
        stored = _apply_verb(session, verb, statement, now)
        AuStatement.objects.create(
            tenant_id=session.tenant_id,
            session=session,
            statement_id=parsed_id,
            verb=stored["verb"]["id"],
            digest=digest,
            payload=_stamp(session, stored, parsed_id, now),
        )
        session.statement_count += 1
        ids.append(str(parsed_id))
    session.save()
    touch(session.enrollment)
    return ids
