"""Packages a tenant imports into its own LMS so learners launch a Forge course there.

The package holds no course content. A SCORM 1.2 package is a launcher page that opens
the course in the Forge learner app and writes what the app reports (progress, score,
completion) to the host LMS. A cmi5 package names the same page as its Assignable Unit,
and the learner app then reports to the LMS's own xAPI endpoint. Either way Forge stays
the system of record and the learner signs in to Forge.
"""

import html
import io
import json
import zipfile
from urllib.parse import urlsplit
from xml.sax.saxutils import escape, quoteattr

from django.conf import settings
from rest_framework.exceptions import ValidationError

from .models import Dispatch

MAX_ORIGINS = 10
# A fixed timestamp keeps a package byte-identical for the same export.
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def app_base(tenant) -> str:
    """The learner app's address for this tenant (the same rule invite links use)."""
    if settings.AUTH_LINK_BASE_URL:
        return settings.AUTH_LINK_BASE_URL.rstrip("/")
    return f"https://{tenant.custom_domain or f'{tenant.id}.{settings.ROOT_DOMAIN}'}"


def launch_url(dispatch: Dispatch) -> str:
    return f"{app_base(dispatch.tenant)}/dispatch/{dispatch.pk}"


def clean_origins(values, *, required: bool) -> list[str]:
    origins: list[str] = []
    for raw in values:
        parts = urlsplit(str(raw).strip())
        local = settings.DEBUG and parts.hostname in {"localhost", "127.0.0.1"}
        if (
            parts.scheme not in {"https", "http"}
            or (parts.scheme == "http" and not local)
            or not parts.hostname
            or parts.path not in {"", "/"}
            or parts.query
            or parts.fragment
            or parts.username
        ):
            raise ValidationError(
                {"lmsOrigins": f"'{raw}' is not an https origin such as https://lms.example.org."}
            )
        origin = f"{parts.scheme}://{parts.netloc.lower()}"
        if origin not in origins:
            origins.append(origin)
    if len(origins) > MAX_ORIGINS:
        raise ValidationError({"lmsOrigins": f"List at most {MAX_ORIGINS} origins."})
    if required and not origins:
        raise ValidationError(
            {"lmsOrigins": "A SCORM export needs the address your LMS serves content from."}
        )
    return origins


def _script_json(value) -> str:
    """JSON safe to place inside a <script> element."""
    return json.dumps(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def _manifest(dispatch: Dispatch) -> str:
    identifier = f"forge-{dispatch.pk}"
    title = escape(dispatch.course.title)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier={quoteattr(identifier)} version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="forge-org">
    <organization identifier="forge-org">
      <title>{title}</title>
      <item identifier="forge-item" identifierref="forge-sco" isvisible="true">
        <title>{title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="forge-sco" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
"""


LAUNCHER = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 32px 16px; color: #1c2430;
    background: #f7f3ea; }
  main { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 28px;
    border: 1px solid #e3ddd0; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  button { font: inherit; font-weight: 600; padding: 12px 20px; border-radius: 8px; border: 0;
    background: #c2410c; color: #fff; cursor: pointer; }
  button:focus-visible { outline: 3px solid #1c2430; outline-offset: 2px; }
  .note { color: #556070; font-size: 14px; }
  progress { width: 100%; height: 12px; }
</style>
</head>
<body>
<main>
  <h1>__TITLE__</h1>
  <p>This course runs in Soteria Forge. It opens in a new window, and your progress is sent
    back here while this page stays open.</p>
  <p><button type="button" id="open">Open the course</button></p>
  <p><progress id="bar" max="100" value="0" aria-label="Course progress"></progress></p>
  <p id="status" role="status" aria-live="polite">Not started yet.</p>
  <p class="note" id="lms"></p>
  <p class="note">Keep this page open until you finish. This page is served from
    <span id="origin"></span>.</p>
</main>
<script>
(function () {
  var CFG = __CONFIG__;
  var api = null, ready = false, finished = false, last = '', child = null;
  function scan(win) {
    var hops = 0;
    while (win && hops < 12) {
      try { if (win.API) return win.API; } catch (e) {}
      if (!win.parent || win.parent === win) break;
      win = win.parent; hops += 1;
    }
    return null;
  }
  function text(id, value) { document.getElementById(id).textContent = value; }
  try { api = scan(window) || (window.opener ? scan(window.opener) : null); } catch (e) {}
  if (api) {
    ready = String(api.LMSInitialize('')) === 'true';
    if (ready && api.LMSGetValue('cmi.core.lesson_status') === 'not attempted') {
      api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      api.LMSCommit('');
    }
  }
  text('origin', window.location.origin);
  text('lms', ready ? 'Connected to your LMS.'
    : 'Your LMS did not answer, so progress cannot be recorded here. Tell your instructor.');
  document.getElementById('open').addEventListener('click', function () {
    child = window.open(CFG.launchUrl, 'forge-course');
    text('status', child ? 'The course is open in another window.'
      : 'Your browser blocked the new window. Allow pop-ups for this page and try again.');
  });
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== CFG.appOrigin || !data || data.type !== 'forge-dispatch'
      || data.dispatchId !== CFG.dispatchId) return;
    var pct = Math.max(0, Math.min(100, Math.round(Number(data.progressPct) || 0)));
    var key = [pct, !!data.completed, data.scorePct].join('|');
    if (key === last) return;
    last = key;
    document.getElementById('bar').value = pct;
    text('status', data.completed ? 'Course complete. You can close this page.'
      : 'Progress: ' + pct + '%');
    if (!ready || finished) return;
    if (typeof data.scorePct === 'number') {
      api.LMSSetValue('cmi.core.score.min', '0');
      api.LMSSetValue('cmi.core.score.max', '100');
      api.LMSSetValue('cmi.core.score.raw', String(Math.round(data.scorePct)));
    }
    api.LMSSetValue('cmi.core.lesson_location', String(pct));
    if (data.completed) api.LMSSetValue('cmi.core.lesson_status', 'completed');
    api.LMSCommit('');
  });
  function finish() {
    if (!ready || finished) return;
    finished = true;
    api.LMSCommit('');
    api.LMSFinish('');
  }
  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);
})();
</script>
</body>
</html>
"""


def _launcher(dispatch: Dispatch) -> str:
    url = launch_url(dispatch)
    parts = urlsplit(url)
    config = {
        "dispatchId": str(dispatch.pk),
        "launchUrl": url,
        "appOrigin": f"{parts.scheme}://{parts.netloc}",
    }
    return LAUNCHER.replace("__TITLE__", html.escape(dispatch.course.title)).replace(
        "__CONFIG__", _script_json(config)
    )


def _cmi5(dispatch: Dispatch) -> str:
    namespace = settings.XAPI_ACTIVITY_BASE.rstrip("/")
    title = escape(dispatch.course.title)
    description = escape(dispatch.course.description[:500] or dispatch.course.title)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id={quoteattr(f"{namespace}/courses/{dispatch.course_id}")}>
    <title><langstring lang="en-US">{title}</langstring></title>
    <description><langstring lang="en-US">{description}</langstring></description>
  </course>
  <au id={quoteattr(f"{namespace}/dispatches/{dispatch.pk}")} moveOn="Completed"
      launchMethod="OwnWindow">
    <title><langstring lang="en-US">{title}</langstring></title>
    <description><langstring lang="en-US">{description}</langstring></description>
    <url>{escape(launch_url(dispatch))}</url>
  </au>
</courseStructure>
"""


def build(dispatch: Dispatch) -> bytes:
    if dispatch.format == Dispatch.Format.CMI5:
        files = {"cmi5.xml": _cmi5(dispatch)}
    else:
        files = {"imsmanifest.xml": _manifest(dispatch), "index.html": _launcher(dispatch)}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, body in files.items():
            info = zipfile.ZipInfo(name, date_time=ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, body)
    return buffer.getvalue()
