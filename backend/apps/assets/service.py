"""Storing a file as a tenant asset. Shared by the upload API and the MCP media import."""

import mimetypes
import re
import uuid

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.models import record
from apps.standards import storage

from .models import Asset

MAX_UPLOAD_BYTES = 100 * 1024 * 1024

# Active content (HTML, SVG, scripts) is never accepted, whatever the extension.
ALLOWED_PREFIXES = ("image/", "audio/", "video/")
ALLOWED_TYPES = {
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/json",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/vtt",
}
BLOCKED_TYPES = {"image/svg+xml"}
CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def check_content_type(content_type: str) -> str:
    base = content_type.split(";")[0].strip().lower()
    allowed = base in ALLOWED_TYPES or base.startswith(ALLOWED_PREFIXES)
    if not allowed or base in BLOCKED_TYPES:
        raise ValidationError({"file": [f"File type {base or 'unknown'!r} is not allowed."]})
    return base


def check_filename(name: str) -> str:
    if (
        not name
        or len(name) > 255
        or "/" in name
        or "\\" in name
        or name in {".", ".."}
        or CONTROL_CHARS.search(name)
    ):
        raise ValidationError({"file": ["Invalid file name."]})
    return name


def check_size(size: int, limit: int = MAX_UPLOAD_BYTES) -> int:
    if size > limit:
        raise ValidationError({"file": ["Files can be at most 100 MB."]})
    if size == 0:
        raise ValidationError({"file": ["The file is empty."]})
    return size


def new_key(tenant_id: str) -> tuple[uuid.UUID, str]:
    asset_id = uuid.uuid4()
    return asset_id, f"assets/{tenant_id}/{asset_id}"


def store(tenant_id: str, stream, content_type: str) -> tuple[uuid.UUID, str]:
    """Write the bytes to the bucket. Slow; call it outside a database transaction."""
    asset_id, key = new_key(tenant_id)
    storage.put_stream(key, stream, content_type)
    return asset_id, key


def register(
    *, tenant, member, asset_id, key, filename, content_type, size, action, **details
) -> Asset:
    """Record a stored file as an asset of `tenant`, audited."""
    with transaction.atomic():
        asset = Asset.objects.create(
            id=asset_id,
            tenant=tenant,
            key=key,
            filename=filename,
            content_type=content_type,
            size=size,
            created_by=member,
        )
        record(
            action=action,
            actor=member,
            tenant=tenant,
            target=asset,
            filename=filename,
            contentType=content_type,
            size=size,
            **details,
        )
    return asset


def asset_json(asset: Asset) -> dict:
    return {
        "id": asset.pk,
        "assetRef": asset.ref,
        "filename": asset.filename,
        "contentType": asset.content_type,
        "size": asset.size,
    }


def guess_type(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or ""
