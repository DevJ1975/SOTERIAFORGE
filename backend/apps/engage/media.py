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
