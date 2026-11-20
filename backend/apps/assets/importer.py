"""Fetch a generated media file from an allowlisted host into the tenant's bucket.

Used by the `forge_import_media` MCP tool (e.g. an ElevenLabs result URL). The URL
comes from a model, so this is written against server-side request forgery:

- https only, default port, no credentials in the URL;
- the host must be on `MCP_MEDIA_IMPORT_HOSTS` (exact, or a subdomain of an entry
  written as `.example.com`); with no hosts configured the import is off;
- every address the host resolves to must be public, and the connection is made to
  one of those checked addresses (no second DNS lookup to rebind);
- redirects are refused, the body is capped at the upload limit, and the type and
  file name pass the same checks as an upload.
"""

import ipaddress
import socket
import tempfile
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

import httpx
from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as ApiValidationError

from . import service

TIMEOUT = httpx.Timeout(30.0, connect=5.0)
CHUNK = 64 * 1024


class ImportRefused(ValidationError):
    """Shown to the caller as a tool error."""


def host_allowed(host: str) -> bool:
    host = host.lower().rstrip(".")
    for entry in settings.MCP_MEDIA_IMPORT_HOSTS:
        entry = entry.lower()
        if entry.startswith("."):
            if host.endswith(entry):
                return True
        elif host == entry:
            return True
    return False


def check_url(url: str) -> tuple[str, str]:
    """(host, path-and-query) of an importable URL."""
    if not settings.MCP_MEDIA_IMPORT_HOSTS:
        raise ImportRefused("Media import is off: set MCP_MEDIA_IMPORT_HOSTS on the API service.")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ImportRefused("That isn't a valid URL.") from None
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not host or parts.username or parts.password:
        raise ImportRefused("Only https:// URLs without credentials can be imported.")
    if port not in (None, 443):
        raise ImportRefused("Only the default https port can be used.")
    if not host_allowed(host):
        raise ImportRefused(f"{host} isn't an allowed media host.")
    target = parts.path or "/"
    if parts.query:
        target += f"?{parts.query}"
    return host, target


def public_address(host: str) -> str:
    """One address for `host`, after checking that all of them are public."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise ImportRefused(f"{host} couldn't be resolved.") from None
    addresses = [ipaddress.ip_address(info[4][0]) for info in infos]
    if not addresses or not all(a.is_global for a in addresses):
        raise ImportRefused(f"{host} doesn't resolve to a public address.")
    return str(addresses[0])


def filename_for(target: str, given: str, content_type: str) -> str:
    if given:
        return given
    name = unquote(PurePosixPath(target.split("?", 1)[0]).name)[:200]
    if not name or name in {".", ".."}:
        name = "import"
    if "." not in name:
        import mimetypes

        name += mimetypes.guess_extension(content_type) or ""
    return name


def fetch(tenant_id: str, url: str, filename: str = "") -> dict:
    """Download `url` and store it. Returns what `service.register` needs.

    Slow network I/O: call it outside a database transaction, off the shared thread.
    """
    host, target = check_url(url)
    address = public_address(host)
    literal = f"[{address}]" if ":" in address else address
    try:
        # Connect to the address that was checked; TLS and Host still use the name.
        with (
            httpx.Client(timeout=TIMEOUT, follow_redirects=False, trust_env=False) as client,
            client.stream(
                "GET",
                f"https://{literal}{target}",
                headers={"Host": host, "Accept": "*/*"},
                extensions={"sni_hostname": host},
            ) as response,
        ):
            if response.status_code != 200:
                raise ImportRefused(
                    f"{host} answered HTTP {response.status_code} (redirects aren't followed)."
                )
            content_type = _checked(
                service.check_content_type, response.headers.get("content-type", "")
            )
            name = _checked(service.check_filename, filename_for(target, filename, content_type))
            declared = response.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > service.MAX_UPLOAD_BYTES:
                raise ImportRefused("Files can be at most 100 MB.")
            size = 0
            with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024) as spool:
                for chunk in response.iter_bytes(CHUNK):
                    size += len(chunk)
                    if size > service.MAX_UPLOAD_BYTES:
                        raise ImportRefused("Files can be at most 100 MB.")
                    spool.write(chunk)
                if size == 0:
                    raise ImportRefused("The file is empty.")
                spool.seek(0)
                asset_id, key = service.store(tenant_id, spool, content_type)
    except httpx.HTTPError as exc:
        raise ImportRefused(f"Couldn't download from {host}: {type(exc).__name__}.") from None
    return {
        "asset_id": asset_id,
        "key": key,
        "filename": name,
        "content_type": content_type,
        "size": size,
        "source_host": host,
    }


def _checked(check, value: str) -> str:
    try:
        return check(value)
    except ApiValidationError as exc:
        raise ImportRefused("; ".join(m for msgs in exc.detail.values() for m in msgs)) from None
