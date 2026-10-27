import logging
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET
from rest_framework.exceptions import APIException

from .access import from_content_token
from .packages import InvalidPackage, safe_path
from .storage import get, key_for

logger = logging.getLogger(__name__)


def headers(response):
    ancestors = " ".join(settings.STANDARDS_APP_ORIGINS)
    response["Content-Security-Policy"] = (
        f"frame-ancestors 'self' {ancestors}; default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; media-src 'self' blob: data:; "
        "font-src 'self' data:; worker-src 'none'; object-src 'none'; "
        "base-uri 'self'; form-action 'self';"
    )
    response["Cache-Control"] = "no-store"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Content-Type-Options"] = "nosniff"
    response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def authorized(token):
    if not settings.STANDARDS_ENABLED:
        raise Http404()
    try:
        return from_content_token(token)
    except APIException as error:
        raise Http404("This content launch has expired or was revoked.") from error


@require_GET
def player(request, token):
    launch = authorized(token)
    runtime = Path(settings.SCORM_RUNTIME_PATH)
    if not runtime.is_file():
        logger.error("SCORM runtime dependency is missing; install backend/runtime dependencies.")
        return headers(HttpResponse("SCORM runtime is not installed.", status=503))
    payload = {
        "launchId": str(launch.pk),
        "version": launch.binding.package.scorm_version,
        "runtime": launch.runtime,
        "entry": f"files/{launch.binding.package.launch_path}",
        "origins": settings.STANDARDS_APP_ORIGINS,
        "learnerId": str(launch.enrollment.member_id),
    }
    return headers(render(request, "standards/player.html", {"config": payload}))


@require_GET
def runtime_script(request):
    path = Path(settings.SCORM_RUNTIME_PATH)
    if not path.is_file():
        logger.error("SCORM runtime dependency is missing.")
        return headers(HttpResponse("Runtime unavailable.", status=503))
    return headers(FileResponse(path.open("rb"), content_type="application/javascript"))


@require_GET
def asset(request, token, name):
    launch = authorized(token)
    try:
        safe_path(name)
    except InvalidPackage as error:
        raise Http404() from error
    package = launch.binding.package
    if name not in package.files:
        raise Http404()
    try:
        body = get(
            key_for(package.tenant_id, package.pk, f"files/{name}"), limit=package.files[name]
        )
    except APIException:
        return headers(HttpResponse("Package storage is unavailable. Try again.", status=503))
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return headers(HttpResponse(body, content_type=mime))
