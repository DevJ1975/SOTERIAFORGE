import uuid

from django.conf import settings
from django.utils import timezone

from .models import Statement


def completed_event(enrollment, lesson, score: int | None) -> None:
    statement_id = uuid.uuid4()
    namespace = settings.XAPI_ACTIVITY_BASE.rstrip("/")
    payload = {
        "id": str(statement_id),
        "actor": {
            "objectType": "Agent",
            "account": {
                "homePage": namespace,
                "name": str(enrollment.member_id),
            },
        },
        "verb": {
            "id": "http://adlnet.gov/expapi/verbs/completed",
            "display": {"en-US": "completed"},
        },
        "object": {"objectType": "Activity", "id": f"{namespace}/lessons/{lesson.pk}"},
        "context": {
            "registration": str(enrollment.pk),
            "extensions": {f"{namespace}/extensions/tenant": str(enrollment.tenant_id)},
        },
        "result": {"completion": True},
        "timestamp": timezone.now().isoformat(),
    }
    if score is not None:
        payload["result"]["score"] = {"raw": score, "min": 0, "max": 100, "scaled": score / 100}
    Statement.objects.get_or_create(
        tenant_id=enrollment.tenant_id,
        event_key=f"lesson-completed:{enrollment.pk}:{lesson.pk}",
        defaults={"id": statement_id, "payload": payload, "next_attempt_at": timezone.now()},
    )
