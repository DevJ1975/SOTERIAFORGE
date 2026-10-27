from datetime import timedelta
from unittest.mock import AsyncMock

import jwt
import pytest
from aiohttp import ClientConnectionError
from django.db import transaction

from apps.accounts.models import Member, Role
from apps.audit.models import AuditEntry
from apps.engage.models import Classroom
from apps.tenants import rls
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db
BASE = "/api/engage/classrooms"
SECRET = "classroom-test-secret-at-least-32-characters"


@pytest.fixture(autouse=True)
def media_config(settings):
    settings.LIVEKIT_URL = "wss://media.example.com"
    settings.LIVEKIT_API_URL = "https://media.example.com"
    settings.LIVEKIT_API_KEY = "test-key"
    settings.LIVEKIT_API_SECRET = SECRET


@pytest.fixture
def people(lakewood):
    return {
        "teacher": make_member(lakewood, "teacher", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "learner"),
    }


def signed_in(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


@pytest.fixture
def classroom(lakewood, people):
    return Classroom.objects.create(
        tenant=lakewood, created_by=people["teacher"], title="Safety skills"
    )


@pytest.fixture
def provision(monkeypatch):
    mocked = AsyncMock()
    monkeypatch.setattr("apps.engage.media.ensure_room", mocked)
    return mocked


def test_instructor_creates_persistent_audited_classroom(people):
    result = signed_in("teacher").post(BASE, {"title": "Safety skills"}, format="json")
    assert result.status_code == 201
    data = result.json()
    assert data["maxParticipants"] == 21
    assert data["createdBy"] == str(people["teacher"].pk)
    room = Classroom.objects.get(pk=data["id"])
    assert room.tenant_id == "lakewood"
    assert AuditEntry.objects.get(action="engage.classroom.created").target_id == str(room.pk)


def test_learner_cannot_create(people):
    assert signed_in("learner").post(BASE, {"title": "No"}, format="json").status_code == 403
    assert not Classroom.objects.exists()


@pytest.mark.parametrize("title", ["", " ", "x" * 121])
def test_invalid_title_is_rejected(people, title):
    assert signed_in("teacher").post(BASE, {"title": title}, format="json").status_code == 400


def test_list_is_tenant_scoped(classroom, acme):
    outsider = make_member(acme, "outsider")
    Classroom.objects.create(tenant=acme, created_by=outsider, title="Private")
    response = signed_in("learner").get(BASE)
    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == [str(classroom.pk)]


def test_cross_tenant_join_is_not_found(classroom, acme, provision):
    make_member(acme, "outsider")
    client = client_for(sign_in("outsider"), tenant="acme")
    assert client.post(f"{BASE}/{classroom.pk}/join").status_code == 404
    provision.assert_not_awaited()


@pytest.mark.parametrize("uid,screen_share", [("learner", False), ("teacher", True)])
def test_token_has_only_scoped_media_permissions(classroom, provision, uid, screen_share):
    response = signed_in(uid).post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    result = response.json()
    claims = jwt.decode(result["token"], SECRET, algorithms=["HS256"], issuer="test-key")
    assert claims["sub"] == str(Member.objects.get(firebase_uid=uid).pk)
    assert claims["name"] == "Class participant"
    assert claims["exp"] - claims["nbf"] == timedelta(minutes=5).total_seconds()
    assert claims["roomConfig"]["maxParticipants"] == 21
    grants = claims["video"]
    assert grants["room"] == classroom.room_name
    assert grants["roomJoin"] is True
    assert grants["roomAdmin"] is False
    assert grants["canPublishData"] is False
    assert grants["canUpdateOwnMetadata"] is False
    assert grants["canSubscribe"] is True
    assert grants["canPublishSources"] == (
        ["camera", "microphone", "screen_share", "screen_share_audio"]
        if screen_share
        else ["camera", "microphone"]
    )
    assert result["canScreenShare"] is screen_share
    assert "secret" not in result
    provision.assert_awaited_once()


def test_join_requires_authentication(classroom, provision):
    assert client_for().post(f"{BASE}/{classroom.pk}/join").status_code == 401
    provision.assert_not_awaited()


def test_deactivated_member_cannot_join(classroom, people, provision):
    people["learner"].status = Member.Status.DEACTIVATED
    people["learner"].save()
    assert signed_in("learner").post(f"{BASE}/{classroom.pk}/join").status_code == 403
    provision.assert_not_awaited()


def test_media_failure_is_explicit(classroom, provision):
    provision.side_effect = ClientConnectionError("offline")
    response = signed_in("learner").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 503
    assert "token" not in response.json()


def test_unconfigured_media_does_not_create_room(people, settings):
    settings.LIVEKIT_API_SECRET = ""
    response = signed_in("teacher").post(BASE, {"title": "Safety"}, format="json")
    assert response.status_code == 503
    assert not Classroom.objects.exists()


def test_production_rejects_insecure_media(classroom, settings, provision):
    settings.DEBUG = False
    settings.LIVEKIT_URL = "ws://media.example.com"
    response = signed_in("learner").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 503
    provision.assert_not_awaited()


def test_production_rejects_development_credentials(classroom, settings, provision):
    settings.DEBUG = False
    settings.LIVEKIT_API_KEY = "devkey"
    settings.LIVEKIT_API_SECRET = "secret"
    response = signed_in("learner").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 503
    provision.assert_not_awaited()


def test_room_capacity_is_provisioned_server_side(classroom, monkeypatch):
    from apps.engage.media import ensure_room

    client = AsyncMock()
    client.__aenter__.return_value = client
    monkeypatch.setattr("apps.engage.media.api.LiveKitAPI", lambda *_a, **_kw: client)
    from asgiref.sync import async_to_sync

    async_to_sync(ensure_room)(classroom)
    request = client.room.create_room.call_args.args[0]
    assert request.name == classroom.room_name
    assert request.max_participants == 21
    assert request.empty_timeout == 300


def test_rls_blocks_unscoped_reads_and_cross_tenant_writes(classroom, acme):
    rls.set_bypass(False)
    assert Classroom.objects.count() == 0
    rls.set_tenant("lakewood")
    assert Classroom.objects.count() == 1
    with pytest.raises(Exception, match="row-level security"), transaction.atomic():
        Classroom.objects.filter(pk=classroom.pk).update(tenant=acme)
