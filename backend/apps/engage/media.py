import json
import logging
from datetime import timedelta
from urllib.parse import urlsplit

from aiohttp import ClientError, ClientTimeout
from asgiref.sync import async_to_sync
from django.conf import settings
from livekit import api
from rest_framework.exceptions import APIException

from apps.accounts.models import Member

from .models import MAX_PARTICIPANTS, Classroom

logger = logging.getLogger(__name__)


class MediaUnavailable(APIException):
    status_code = 503
    default_detail = "Video classrooms are unavailable. Please contact your instructor."


def check_configuration() -> None:
    if not all(
        [
            settings.LIVEKIT_URL,
            settings.LIVEKIT_API_URL,
            settings.LIVEKIT_API_KEY,
            settings.LIVEKIT_API_SECRET,
        ]
    ):
        logger.error("Engage LiveKit configuration is incomplete")
        raise MediaUnavailable()
    browser_url = urlsplit(settings.LIVEKIT_URL)
    if browser_url.scheme not in {"ws", "wss"} or not browser_url.hostname:
        logger.error("LIVEKIT_URL must be an absolute WebSocket URL")
        raise MediaUnavailable()
    if not settings.DEBUG and browser_url.scheme != "wss":
        logger.error("LIVEKIT_URL must use wss in production")
        raise MediaUnavailable()
    if not settings.DEBUG and (
        settings.LIVEKIT_API_KEY == "devkey" or len(settings.LIVEKIT_API_SECRET.encode()) < 32
    ):
        logger.error("Production LiveKit requires a non-development key and a strong secret")
        raise MediaUnavailable()


async def ensure_room(classroom: Classroom) -> None:
    async with api.LiveKitAPI(
        settings.LIVEKIT_API_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET,
        timeout=ClientTimeout(total=10),
    ) as client:
        await client.room.create_room(
            api.CreateRoomRequest(
                name=classroom.room_name,
                max_participants=MAX_PARTICIPANTS,
                empty_timeout=300,
                departure_timeout=30,
            )
        )


def join_credentials(classroom: Classroom, member: Member, *, can_screen_share: bool) -> dict:
    check_configuration()
    try:
        async_to_sync(ensure_room)(classroom)
    except (api.TwirpError, ClientError, TimeoutError):
        logger.warning("LiveKit room provisioning failed for classroom %s", classroom.pk)
        raise MediaUnavailable() from None

    sources = ["camera", "microphone"]
    if can_screen_share:
        sources.extend(["screen_share", "screen_share_audio"])
    token = (
        api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(str(member.pk))
        .with_name(member.display_name or "Class participant")
        .with_ttl(timedelta(minutes=5))
        .with_room_config(
            api.RoomConfiguration(
                max_participants=MAX_PARTICIPANTS,
                empty_timeout=300,
                departure_timeout=30,
            )
        )
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=classroom.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=False,
                can_publish_sources=sources,
                can_update_own_metadata=False,
                room_admin=False,
            )
        )
        .to_jwt()
    )
    return {
        "serverUrl": settings.LIVEKIT_URL,
        "token": token,
        "canScreenShare": can_screen_share,
    }


def _client() -> api.LiveKitAPI:
    return api.LiveKitAPI(
        settings.LIVEKIT_API_URL,
        settings.LIVEKIT_API_KEY,
        settings.LIVEKIT_API_SECRET,
        timeout=ClientTimeout(total=5),
    )


TOPIC = "forge-engage"


def notify(room_name: str, session_id, version: int, identities: list[str] | None = None) -> None:
    """Tell clients in the room that the session state changed, so they refetch it.

    Best effort: clients also poll, so a failed ping only delays an update. Nothing but
    the session id and version travels over the media server.
    """

    async def send() -> None:
        async with _client() as client:
            await client.room.send_data(
                api.SendDataRequest(
                    room=room_name,
                    data=json.dumps({"sessionId": str(session_id), "version": version}).encode(),
                    kind=api.DataPacket.Kind.RELIABLE,
                    topic=TOPIC,
                    destination_identities=identities or [],
                )
            )

    try:
        check_configuration()
        async_to_sync(send)()
    except (api.TwirpError, ClientError, TimeoutError, MediaUnavailable):
        logger.info("Engage state ping not delivered for session %s", session_id)


def mute(room_name: str, identity: str) -> None:
    """Mute a participant's microphone. They can unmute themselves again."""

    async def run() -> None:
        async with _client() as client:
            who = api.RoomParticipantIdentity(room=room_name, identity=identity)
            participant = await client.room.get_participant(who)
            for track in participant.tracks:
                if track.type == api.TrackType.AUDIO and not track.muted:
                    await client.room.mute_published_track(
                        api.MuteRoomTrackRequest(
                            room=room_name, identity=identity, track_sid=track.sid, muted=True
                        )
                    )

    _moderate(run)


def remove(room_name: str, identity: str) -> None:
    """Disconnect a participant from the room."""

    async def run() -> None:
        async with _client() as client:
            await client.room.remove_participant(
                api.RoomParticipantIdentity(room=room_name, identity=identity)
            )

    _moderate(run)


def _moderate(run) -> None:
    check_configuration()
    try:
        async_to_sync(run)()
    except api.TwirpError as error:
        if error.code == "not_found":
            return  # already gone
        logger.warning("LiveKit moderation call failed: %s", error.code)
        raise MediaUnavailable() from None
    except (ClientError, TimeoutError):
        logger.warning("LiveKit moderation call failed")
        raise MediaUnavailable() from None
