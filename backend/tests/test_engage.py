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
from apps.tenants.models import Tenant
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


# --- More WebRTC edge cases ---------------------------------------------------


def decode(token):
    return jwt.decode(token, SECRET, algorithms=["HS256"], issuer="test-key")


def test_suspended_tenant_cannot_list_or_join(classroom, provision, lakewood):
    lakewood.status = "suspended"
    lakewood.save()
    assert signed_in("learner").get(BASE).status_code == 403
    assert signed_in("learner").post(f"{BASE}/{classroom.pk}/join").status_code == 403
    provision.assert_not_awaited()


def test_list_requires_authentication(classroom):
    assert client_for().get(BASE).status_code == 401


def test_token_carries_no_email_or_firebase_identity(classroom, people, provision):
    token = signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()["token"]
    payload = str(decode(token))
    assert "example.com" not in payload  # members' emails are @example.com in these tests
    assert "learner" not in decode(token)["sub"]  # opaque membership id, not the Firebase uid


def test_display_name_is_used_when_the_member_has_one(classroom, people, provision):
    Member.objects.filter(pk=people["learner"].pk).update(display_name="Marcus Walker")
    token = signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()["token"]
    assert decode(token)["name"] == "Marcus Walker"


def test_joining_twice_reuses_one_identity(classroom, people, provision):
    """Why a second tab kicks the first: LiveKit drops the older session with
    DUPLICATE_IDENTITY, which the learner UI now explains."""
    first = decode(signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()["token"])
    second = decode(signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()["token"])
    assert first["sub"] == second["sub"] == str(people["learner"].pk)


def test_different_members_get_different_identities(classroom, people, provision):
    teacher = decode(signed_in("teacher").post(f"{BASE}/{classroom.pk}/join").json()["token"])
    learner = decode(signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()["token"])
    assert teacher["sub"] != learner["sub"]


def test_tenant_admin_may_share_their_screen_but_a_learner_may_not(classroom, lakewood, provision):
    make_member(lakewood, "boss", Role.TENANT_ADMIN)
    admin = signed_in("boss").post(f"{BASE}/{classroom.pk}/join").json()
    learner = signed_in("learner").post(f"{BASE}/{classroom.pk}/join").json()
    assert admin["canScreenShare"] is True
    assert "screen_share" in decode(admin["token"])["video"]["canPublishSources"]
    assert learner["canScreenShare"] is False
    assert "screen_share" not in decode(learner["token"])["video"]["canPublishSources"]


def test_superadmin_acting_in_another_tenant_cannot_join_this_tenants_room(classroom, provision):
    Member.objects.create(tenant=None, firebase_uid="root", email="r@x.io", role=Role.SUPERADMIN)
    acme = Tenant.objects.create(id="acme", name="Acme", status="active")
    assert acme.pk == "acme"
    response = client_for(sign_in("root"), tenant="acme").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 404
    provision.assert_not_awaited()


def test_superadmin_without_a_tenant_is_told_to_pick_one(classroom, provision):
    Member.objects.create(tenant=None, firebase_uid="root", email="r@x.io", role=Role.SUPERADMIN)
    root = client_for(sign_in("root"))
    assert root.get(BASE).status_code == 403
    assert root.post(f"{BASE}/{classroom.pk}/join").status_code == 403
    provision.assert_not_awaited()


@pytest.mark.parametrize("bad_id", ["not-a-uuid", "123", "00000000-0000-0000-0000-000000000000"])
def test_unknown_or_malformed_classroom_ids_are_404(people, provision, bad_id):
    assert signed_in("learner").post(f"{BASE}/{bad_id}/join").status_code == 404
    provision.assert_not_awaited()


@pytest.mark.parametrize("failure", [TimeoutError(), ClientConnectionError("down")])
def test_slow_or_unreachable_media_server_is_a_clean_503(classroom, provision, failure):
    provision.side_effect = failure
    response = signed_in("learner").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 503
    assert set(response.json()) == {"detail"}


def test_livekit_rejecting_the_request_is_a_clean_503(classroom, provision):
    from livekit import api

    provision.side_effect = api.TwirpError(code="internal", msg="boom", status=500)
    response = signed_in("learner").post(f"{BASE}/{classroom.pk}/join")
    assert response.status_code == 503
    assert "boom" not in response.text  # no media-server internals leak to the browser


def test_title_is_trimmed_and_capped(people):
    ok = signed_in("teacher").post(BASE, {"title": "  Safety skills  "}, format="json")
    assert ok.json()["title"] == "Safety skills"
    assert signed_in("teacher").post(BASE, {"title": "x" * 121}, format="json").status_code == 400
    assert Classroom.objects.count() == 1


def test_every_classroom_gets_its_own_media_room(lakewood, acme, people):
    other = Classroom.objects.create(tenant=lakewood, created_by=people["teacher"], title="Two")
    first = Classroom.objects.create(tenant=lakewood, created_by=people["teacher"], title="One")
    outsider = make_member(acme, "outsider")
    foreign = Classroom.objects.create(tenant=acme, created_by=outsider, title="Three")
    names = {other.room_name, first.room_name, foreign.room_name}
    assert len(names) == 3
    assert foreign.room_name.startswith("forge-acme-")
