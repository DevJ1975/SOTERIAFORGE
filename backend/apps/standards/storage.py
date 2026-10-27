"""Private S3-compatible Railway Bucket; local filesystem is opt-in in DEBUG only."""

import logging
from pathlib import Path
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = "Package storage is unavailable or not configured."


def local_root() -> Path | None:
    if settings.STANDARDS_LOCAL_ROOT:
        if not settings.DEBUG:
            raise StorageUnavailable("Local package storage requires DEBUG mode.")
        return Path(settings.STANDARDS_LOCAL_ROOT).resolve()
    return None


def key_for(tenant_id: str, package_id, name: str) -> str:
    if (
        not name
        or name.startswith("/")
        or "\\" in name
        or any(p in {"", ".", ".."} for p in name.split("/"))
    ):
        raise ValueError("Invalid storage path")
    return f"standards/{tenant_id}/{package_id}/{name}"


def client():
    if not all(
        [
            settings.STANDARDS_S3_ENDPOINT,
            settings.STANDARDS_S3_BUCKET,
            settings.STANDARDS_S3_ACCESS_KEY,
            settings.STANDARDS_S3_SECRET_KEY,
        ]
    ):
        raise StorageUnavailable()
    endpoint = urlsplit(settings.STANDARDS_S3_ENDPOINT)
    if (
        endpoint.scheme != "https"
        or not endpoint.netloc
        or endpoint.username
        or endpoint.password
        or endpoint.query
        or endpoint.fragment
    ):
        raise StorageUnavailable("Configure a credential-free HTTPS S3 endpoint.")
    return boto3.client(
        "s3",
        endpoint_url=settings.STANDARDS_S3_ENDPOINT,
        aws_access_key_id=settings.STANDARDS_S3_ACCESS_KEY,
        aws_secret_access_key=settings.STANDARDS_S3_SECRET_KEY,
        region_name=settings.STANDARDS_S3_REGION,
        config=Config(
            signature_version="s3v4",
            connect_timeout=5,
            read_timeout=20,
            retries={"max_attempts": 2},
            s3={"addressing_style": "path"},
        ),
    )


def put(key: str, body: bytes) -> None:
    root = local_root()
    if root:
        target = root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        return
    try:
        client().put_object(Bucket=settings.STANDARDS_S3_BUCKET, Key=key, Body=body)
    except (BotoCoreError, ClientError) as error:
        logger.error("Standards object write failed: %s", type(error).__name__)
        raise StorageUnavailable() from error


def get(key: str, *, limit: int) -> bytes:
    root = local_root()
    if root:
        try:
            with (root / key).open("rb") as stream:
                body = stream.read(limit + 1)
        except OSError as error:
            logger.error("Standards local object read failed: %s", type(error).__name__)
            raise StorageUnavailable() from error
    else:
        try:
            response = client().get_object(Bucket=settings.STANDARDS_S3_BUCKET, Key=key)
            with response["Body"] as stream:
                body = stream.read(limit + 1)
        except (BotoCoreError, ClientError) as error:
            logger.error("Standards object read failed: %s", type(error).__name__)
            raise StorageUnavailable() from error
    if len(body) > limit:
        raise StorageUnavailable("Stored package object exceeds its allowed size.")
    return body
