"""xAPI statements queued for the tenant's external LRS (the `Statement` outbox).

Each helper is called inside the transaction that records the event, and each event
has a key so it is queued once however often the request is retried. Actors are the
pseudonymous member account, never a name or email.
"""

import uuid

from django.conf import settings
from django.utils import timezone

from .models import Statement

VERB = "http://adlnet.gov/expapi/verbs/"


def _namespace() -> str:
    return settings.XAPI_ACTIVITY_BASE.rstrip("/")


def _actor(member_id) -> dict:
    return {
        "objectType": "Agent",
        "account": {"homePage": _namespace(), "name": str(member_id)},
    }


def _score(pct: int) -> dict:
    return {"raw": pct, "min": 0, "max": 100, "scaled": pct / 100}


def _queue(tenant_id, event_key: str, payload: dict) -> None:
    if not settings.XAPI_RECORDING_ENABLED:
        return
    Statement.objects.get_or_create(
        tenant_id=tenant_id,
        event_key=event_key,
        defaults={"id": payload["id"], "payload": payload, "next_attempt_at": timezone.now()},
    )


def _statement(enrollment, verb: str, object_: dict, result: dict, parents=()) -> dict:
    namespace = _namespace()
    context = {
        "registration": str(enrollment.pk),
        "extensions": {f"{namespace}/extensions/tenant": str(enrollment.tenant_id)},
    }
    if parents:
        context["contextActivities"] = {
            "parent": [{"objectType": "Activity", "id": parent} for parent in parents]
        }
    return {
        "id": str(uuid.uuid4()),
        "actor": _actor(enrollment.member_id),
        "verb": {"id": VERB + verb, "display": {"en-US": verb}},
        "object": {"objectType": "Activity", **object_},
        "context": context,
        "result": result,
        "timestamp": timezone.now().isoformat(),
    }


def completed_event(enrollment, lesson, score: int | None) -> None:
    namespace = _namespace()
    result: dict = {"completion": True}
    if score is not None:
        result["score"] = _score(score)
    _queue(
        enrollment.tenant_id,
        f"lesson-completed:{enrollment.pk}:{lesson.pk}",
        _statement(enrollment, "completed", {"id": f"{namespace}/lessons/{lesson.pk}"}, result),
    )


def course_completed_event(enrollment) -> None:
    namespace = _namespace()
    _queue(
        enrollment.tenant_id,
        f"course-completed:{enrollment.pk}",
        _statement(
            enrollment,
            "completed",
            {
                "id": f"{namespace}/courses/{enrollment.course_id}",
                "definition": {"type": "http://adlnet.gov/expapi/activities/course"},
            },
            {"completion": True},
        ),
    )


def quiz_event(attempt) -> None:
    """One `passed` or `failed` per graded attempt, with the score."""
    namespace = _namespace()
    _queue(
        attempt.tenant_id,
        f"quiz-attempt:{attempt.pk}",
        _statement(
            attempt.enrollment,
            "passed" if attempt.passed else "failed",
            {
                "id": f"{namespace}/quizzes/{attempt.quiz_id}",
                "definition": {"type": "http://adlnet.gov/expapi/activities/assessment"},
            },
            {
                "success": attempt.passed,
                "score": _score(attempt.score_pct),
                "extensions": {f"{namespace}/extensions/attempt": attempt.number},
            },
            parents=[f"{namespace}/lessons/{attempt.lesson_id}"],
        ),
    )


def au_statement_event(tenant_id, stored: dict) -> None:
    """Forward a statement an Assignable Unit sent, as the server stamped it.

    Its `completed` is left out: completing the lesson queues the server's own.
    """
    if stored["verb"]["id"] == VERB + "completed":
        return
    payload = {k: v for k, v in stored.items() if k not in {"stored", "authority"}}
    _queue(tenant_id, f"au:{payload['id']}", payload)
