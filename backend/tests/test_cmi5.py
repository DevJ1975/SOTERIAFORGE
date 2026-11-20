import base64
import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.learning.models import Course, Enrollment, Lesson, LessonProgress, Module
from apps.standards.cmi5 import COMPLETED, FAILED, INITIALIZED, PASSED, TERMINATED
from apps.standards.models import AuSession, AuStatement, Statement
from apps.tenants import rls
from apps.tenants.models import Tenant
from conftest import client_for, make_member, sign_in
from tests.content import build_course

pytestmark = pytest.mark.django_db

APP = "https://learner.example.test"
AU = "https://games.example.test/lockout/index.html"
CUSTOM = "https://soteriaforge.com/xapi/verbs/isolated-energy"


@pytest.fixture
def lesson(lakewood, settings):
    settings.STANDARDS_APP_ORIGINS = [APP]
    settings.XAPI_RECORDING_ENABLED = True
    teacher = make_member(lakewood, "teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "learner")
    make_member(lakewood, "peer")
    content = build_course(lakewood, teacher)
    Enrollment.objects.create(tenant=lakewood, course=content.course, member=learner)
    return Lesson.objects.create(
        tenant=lakewood,
        module=content.module,
        title="Lockout / tagout simulator",
        order=9,
        content_type="unity",
        external_url=AU,
    )


def as_(uid):
    return client_for(sign_in(uid))


def launch(lesson, uid="learner"):
    return as_(uid).post(f"/api/standards/lessons/{lesson.pk}/cmi5/launch", HTTP_ORIGIN=APP)


def fetch(launched):
    return APIClient().post(launched["fetch"])


def au(token, scheme="Bearer", version="1.0.3"):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"{scheme} {token}", HTTP_X_EXPERIENCE_API_VERSION=version
    )
    return client


def statement(launched, verb, *, scaled=None, object_id=None, **extra):
    body = {
        "id": str(uuid.uuid4()),
        "actor": {"account": {"homePage": "https://evil.example", "name": "someone-else"}},
        "verb": {"id": verb},
        "object": {"id": object_id or launched["activityId"]},
        "context": {
            "registration": str(uuid.uuid4()),
            "extensions": {"https://soteriaforge.com/xapi/extensions/tenant": "other-tenant"},
        },
        **extra,
    }
    if scaled is not None:
        body["result"] = {"score": {"scaled": scaled}}
    return body


def send(client, body):
    return client.post("/api/standards/xapi/statements", body, format="json")


def started(lesson):
    """A launched session with its token fetched and `initialized` sent."""
    launched = launch(lesson).data
    client = au(fetch(launched).data["auth-token"])
    assert send(client, statement(launched, INITIALIZED)).status_code == 200
    return launched, client


def test_launch_returns_cmi5_parameters_for_the_enrolled_learner(lesson):
    response = launch(lesson)
    assert response.status_code == 201, response.data
    assert response["Cache-Control"] == "no-store"
    data = response.data
    enrollment = Enrollment.objects.get(member__email="learner@example.com")
    assert data["auUrl"] == AU
    assert data["endpoint"].endswith("/api/standards/xapi/")
    assert data["registration"] == str(enrollment.pk)
    assert data["activityId"].endswith(f"/lessons/{lesson.pk}")
    assert f'"name": "{enrollment.member_id}"' in data["actor"]
    session = AuSession.objects.get(pk=data["id"])
    # Neither secret is stored: only hashes.
    assert data["fetch"].rsplit("/", 1)[1] != session.fetch_hash


def test_launch_requires_enrollment_a_published_course_and_an_isolated_url(lesson):
    assert launch(lesson, "peer").status_code == 403
    video = Lesson.objects.filter(content_type="video").first()
    assert launch(video).status_code == 409
    lesson.external_url = f"{APP}/games/index.html"
    lesson.save()
    assert launch(lesson).status_code == 409  # would share the learner app's origin
    lesson.external_url = "http://games.example.test/index.html"
    lesson.save()
    assert launch(lesson).status_code == 409  # https only outside DEBUG
    lesson.external_url = ""
    lesson.asset_ref = "tenants/lakewood/games/demo/index.html"
    lesson.save()
    assert launch(lesson).status_code == 409  # no absolute launch URL
    lesson.external_url = AU
    lesson.save()
    Course.objects.update(status="draft")
    assert launch(lesson).status_code in {404, 409}


def test_fetch_url_works_once_and_reports_cmi5_errors(lesson):
    launched = launch(lesson).data
    first = fetch(launched)
    assert first.status_code == 200
    assert first["Cache-Control"] == "no-store"
    session_id, _, secret = base64.b64decode(first.data["auth-token"]).decode().partition(":")
    assert session_id == launched["id"] and secret
    again = fetch(launched)
    assert again.status_code == 403 and again.data["error-code"] == "1"
    wrong = APIClient().post(launched["fetch"][:-4] + "abcd")
    assert wrong.status_code == 403 and wrong.data["error-code"] == "2"
    expired = launch(lesson).data
    AuSession.objects.filter(pk=expired["id"]).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    assert fetch(expired).data["error-code"] == "3"


def test_statements_need_a_fetched_token_and_the_xapi_version_header(lesson):
    launched = launch(lesson).data
    unfetched = base64.b64encode(f"{launched['id']}:guess".encode()).decode()
    assert send(au(unfetched), statement(launched, INITIALIZED)).status_code == 401
    assert send(au("not-base64!"), statement(launched, INITIALIZED)).status_code == 401
    # A member's own sign-in token is not an AU credential.
    assert send(au(sign_in("learner")), statement(launched, INITIALIZED)).status_code == 401
    token = fetch(launched).data["auth-token"]
    assert send(au(token, version=""), statement(launched, INITIALIZED)).status_code == 400
    response = send(au(token, scheme="Basic"), statement(launched, INITIALIZED))
    assert response.status_code == 200, response.data
    assert response["X-Experience-API-Version"] == "1.0.3"


def test_identity_and_tenant_are_stamped_from_the_session(lesson, lakewood):
    launched, client = started(lesson)
    stored = AuStatement.objects.get(verb=INITIALIZED)
    payload = stored.payload
    learner = Enrollment.objects.get(member__email="learner@example.com")
    assert payload["actor"]["account"]["name"] == str(learner.member_id)
    assert payload["context"]["registration"] == str(learner.pk)
    extensions = payload["context"]["extensions"]
    assert extensions["https://soteriaforge.com/xapi/extensions/tenant"] == str(lakewood.pk)
    assert extensions["https://w3id.org/xapi/cmi5/context/extensions/sessionid"] == launched["id"]
    assert stored.tenant_id == lakewood.pk


def test_completed_and_passed_complete_the_lesson_once_with_the_score(lesson):
    launched, client = started(lesson)
    assert (
        send(client, statement(launched, CUSTOM, object_id="https://x.test/valve")).status_code
        == 200
    )
    assert not LessonProgress.objects.filter(lesson=lesson).exists()
    assert send(client, statement(launched, COMPLETED)).status_code == 200
    progress = LessonProgress.objects.get(lesson=lesson)
    assert progress.completed_at is not None and progress.score is None
    assert send(client, statement(launched, PASSED, scaled=0.85)).status_code == 200
    progress.refresh_from_db()
    assert progress.score == 85
    assert send(client, statement(launched, COMPLETED)).status_code == 409
    assert send(client, statement(launched, FAILED, scaled=0.1)).status_code == 409
    assert send(client, statement(launched, TERMINATED)).status_code == 200
    assert send(client, statement(launched, CUSTOM)).status_code == 409
    progress.refresh_from_db()
    assert progress.score == 85
    assert Statement.objects.count() == 1  # one outbox `completed` for the external LRS
    session = as_("learner").get(f"/api/standards/cmi5/sessions/{launched['id']}")
    assert session.status_code == 200
    assert session.data["completed"] and session.data["success"] and session.data["terminated"]
    assert session.data["score"] == 85
    # `passed` after `completed` updates the score but keeps the first completion's award.
    assert session.data["completion"]["firstCompletion"] is True
    assert session.data["completion"]["award"]["awarded"] > 0
    assert as_("peer").get(f"/api/standards/cmi5/sessions/{launched['id']}").status_code == 404


def test_a_failed_attempt_alone_does_not_complete_the_lesson(lesson):
    launched, client = started(lesson)
    assert send(client, statement(launched, FAILED, scaled=0.2)).status_code == 200
    assert not LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).exists()
    data = as_("learner").get(f"/api/standards/cmi5/sessions/{launched['id']}").data
    assert data["success"] is False and data["completion"] is None


def test_statement_order_and_validation(lesson):
    launched = launch(lesson).data
    client = au(fetch(launched).data["auth-token"])
    assert send(client, statement(launched, COMPLETED)).status_code == 409  # before initialized
    assert send(client, statement(launched, INITIALIZED)).status_code == 200
    assert send(client, statement(launched, INITIALIZED)).status_code == 409
    assert send(client, statement(launched, PASSED, scaled=1.5)).status_code == 400
    assert send(client, statement(launched, PASSED, scaled=True)).status_code == 400
    other = statement(launched, COMPLETED, object_id="https://x.test/another-lesson")
    assert send(client, other).status_code == 400
    waived = statement(launched, "https://w3id.org/xapi/adl/verbs/waived")
    assert send(client, waived).status_code == 403
    assert send(client, {"verb": {"id": "nope"}}).status_code == 400
    assert send(client, statement(launched, CUSTOM, id="not-a-uuid")).status_code == 400
    assert send(client, []).status_code == 400
    assert send(client, [statement(launched, CUSTOM)] * 51).status_code == 400
    big = statement(launched, CUSTOM, result={"response": "x" * 70_000})
    assert send(client, big).status_code == 400
    assert not LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).exists()
    assert AuStatement.objects.count() == 1


def test_a_retry_is_idempotent_and_a_changed_statement_conflicts(lesson):
    launched, client = started(lesson)
    done = statement(launched, COMPLETED)
    first = send(client, done)
    assert first.status_code == 200 and first.data == [done["id"]]
    assert send(client, done).data == [done["id"]]
    assert AuStatement.objects.filter(verb=COMPLETED).count() == 1
    assert send(client, {**done, "result": {"completion": True}}).status_code == 409
    put = statement(launched, CUSTOM)
    url = f"/api/standards/xapi/statements?statementId={put['id']}"
    assert client.put(url, put, format="json").status_code == 204
    assert client.put(url, put, format="json").status_code == 204
    mismatch = f"/api/standards/xapi/statements?statementId={uuid.uuid4()}"
    assert client.put(mismatch, put, format="json").status_code == 400
    assert AuStatement.objects.filter(verb=CUSTOM).count() == 1


def test_a_batch_is_all_or_nothing(lesson):
    launched, client = started(lesson)
    batch = [statement(launched, COMPLETED), statement(launched, COMPLETED)]
    assert send(client, batch).status_code == 409
    assert AuStatement.objects.filter(verb=COMPLETED).count() == 0
    assert not LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).exists()


def test_a_new_launch_or_a_revoked_or_expired_session_stops_the_old_token(lesson):
    launched, client = started(lesson)
    relaunched = launch(lesson).data
    assert send(client, statement(launched, COMPLETED)).status_code == 403
    second = au(fetch(relaunched).data["auth-token"])
    assert send(second, statement(relaunched, INITIALIZED)).status_code == 200
    AuSession.objects.filter(pk=relaunched["id"]).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    assert send(second, statement(relaunched, COMPLETED)).status_code == 403
    assert not LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).exists()


def test_launch_data_state_document(lesson):
    launched, client = started(lesson)
    response = client.get("/api/standards/xapi/activities/state", {"stateId": "LMS.LaunchData"})
    assert response.status_code == 200
    assert response.data["launchMode"] == "Normal"
    assert response.data["moveOn"] == "CompletedOrPassed"
    assert response.data["contextTemplate"]["registration"] == launched["registration"]
    other = client.get("/api/standards/xapi/activities/state", {"stateId": "save"})
    assert other.status_code == 404


def test_au_lessons_cannot_be_completed_by_hand(lesson):
    response = as_("learner").post(f"/api/lessons/{lesson.pk}/complete", {}, format="json")
    assert response.status_code == 409
    assert not LessonProgress.objects.filter(lesson=lesson, completed_at__isnull=False).exists()


def test_a_session_cannot_reach_another_tenant(lesson):
    """The token decides the tenant: RLS hides every other tenant's rows from it."""
    other = Tenant.objects.create(id="other", name="Other", status="active")
    author = make_member(other, "author", Role.INSTRUCTOR)
    make_member(other, "outsider")
    course = Course.objects.create(
        tenant=other, title="Other", status="published", created_by=author
    )
    module = Module.objects.create(tenant=other, course=course, title="M", order=1)
    foreign = Lesson.objects.create(
        tenant=other, module=module, title="Sim", order=1, content_type="unity", external_url=AU
    )
    launched, client = started(lesson)
    # A lakewood learner cannot launch the other tenant's lesson...
    assert launch(foreign).status_code == 404
    # ...an outsider cannot read this session...
    assert (
        client_for(sign_in("outsider"))
        .get(f"/api/standards/cmi5/sessions/{launched['id']}")
        .status_code
        == 404
    )
    # ...and statements naming the other tenant are stored under the session's tenant.
    assert send(client, statement(launched, COMPLETED)).status_code == 200
    assert set(AuStatement.objects.values_list("tenant_id", flat=True)) == {lesson.tenant_id}
    rls.set_bypass(False)
    rls.set_tenant("other")
    try:
        assert AuStatement.objects.count() == 0 and AuSession.objects.count() == 0
    finally:
        rls.set_tenant(None)
        rls.set_bypass(True)


def test_assignable_units_on_any_origin_may_call_the_au_endpoints_only():
    def preflight(path):
        return APIClient().options(
            path,
            HTTP_ORIGIN="https://games.example.test",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,x-experience-api-version",
        )

    allowed = preflight("/api/standards/xapi/statements")
    assert allowed["Access-Control-Allow-Origin"] == "https://games.example.test"
    assert "x-experience-api-version" in allowed["Access-Control-Allow-Headers"].lower()
    assert "Access-Control-Allow-Origin" in preflight(f"/api/standards/cmi5/fetch/{uuid.uuid4()}/x")
    assert "Access-Control-Allow-Origin" not in preflight("/api/me")
    assert "Access-Control-Allow-Origin" not in preflight("/api/standards/packages")
