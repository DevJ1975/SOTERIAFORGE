import io
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests
from botocore.stub import Stubber
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client
from django.utils import timezone

from apps.accounts.models import Role
from apps.learning.models import Enrollment, Lesson, LessonProgress
from apps.standards import storage
from apps.standards.access import content_token
from apps.standards.models import Binding, Launch, Package, Statement
from apps.standards.packages import InvalidPackage, inspect_zip
from apps.tenants import rls
from conftest import client_for, make_member, sign_in
from tests.content import build_course

pytestmark = pytest.mark.django_db

MANIFEST = """<manifest xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
<organizations default="org"><organization identifier="org">
<item identifier="item" identifierref="sco"><title>Demo</title></item>
</organization></organizations>
<resources><resource identifier="sco" adlcp:scormtype="sco" href="index.html">
<file href="index.html"/></resource></resources></manifest>"""


def package_zip(manifest=MANIFEST, extra=None):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("imsmanifest.xml", manifest)
        archive.writestr("index.html", "<html>Lesson</html>")
        for name, body in (extra or {}).items():
            archive.writestr(name, body)
    return buffer.getvalue()


@pytest.fixture
def setup(lakewood, settings, tmp_path):
    settings.DEBUG = True
    settings.STANDARDS_ENABLED = True
    settings.STANDARDS_LOCAL_ROOT = str(tmp_path)
    settings.STANDARDS_CONTENT_ORIGIN = "https://content.example.test"
    settings.STANDARDS_APP_ORIGINS = ["https://learner.example.test"]
    settings.XAPI_RECORDING_ENABLED = True
    teacher = make_member(lakewood, "teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "learner")
    make_member(lakewood, "peer")
    content = build_course(lakewood, teacher)
    Enrollment.objects.create(tenant=lakewood, course=content.course, member=learner)
    return content


def as_(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


def upload():
    return as_("teacher").post(
        "/api/standards/packages",
        {"title": "Demo", "file": SimpleUploadedFile("demo.zip", package_zip())},
        format="multipart",
    )


def ready(setup):
    response = upload()
    assert response.status_code == 202, response.data
    call_command("process_scorm")
    package = Package.objects.get(pk=response.data["id"])
    assert package.status == "ready", package.error
    response = as_("teacher").post(
        f"/api/standards/packages/{package.pk}/attach",
        {"moduleId": str(setup.module.pk), "title": "SCORM demo"},
        format="json",
    )
    assert response.status_code == 201, response.data
    return package, Lesson.objects.get(pk=response.data["lessonId"])


def launch(lesson, uid="learner"):
    return as_(uid).post(
        f"/api/standards/lessons/{lesson.pk}/launch",
        HTTP_ORIGIN="https://learner.example.test",
    )


def commit(launch_id, status="incomplete", sequence=1, score=None, uid="learner", version="1.2"):
    scores = {} if score is None else {"raw": str(score), "min": "0", "max": "100"}
    cmi = (
        {"core": {"lesson_status": status, "score": scores}, "suspend_data": "page=2"}
        if version == "1.2"
        else {"completion_status": status, "success_status": "unknown"}
    )
    return as_(uid).post(
        f"/api/standards/launches/{launch_id}/commit",
        {"sequence": sequence, "cmi": {"cmi": cmi}},
        format="json",
    )


def test_import_attach_launch_resume_complete_and_idempotent_outbox(setup):
    package, lesson = ready(setup)
    assert as_("learner").get(f"/api/lessons/{lesson.pk}").data["standardsManaged"]
    response = launch(lesson)
    assert response.status_code == 201, response.data
    launch_id = response.data["id"]
    assert response["Cache-Control"] == "no-store"
    assert response.data["url"].startswith("https://content.example.test/launch/")
    assert commit(launch_id).status_code == 200
    progress = LessonProgress.objects.get(lesson=lesson)
    assert progress.completed_at is None
    assert Statement.objects.count() == 0
    second = launch(lesson).data["id"]
    assert commit(launch_id, "completed", 2).status_code == 403
    assert Launch.objects.get(pk=second).runtime["cmi"]["suspend_data"] == "page=2"
    result = commit(second, "completed", 1, 80)
    assert result.status_code == 200, result.data
    assert result.data["completion"]["firstCompletion"] is True
    assert commit(second, "completed", 1, 80).data == result.data
    assert commit(second, "completed", 1, 81).status_code == 409
    assert commit(second, "completed", 3, 80).status_code == 409
    assert commit(second, "completed", 2, 80).data["completion"]["firstCompletion"] is False
    progress.refresh_from_db()
    assert progress.score == 80
    assert Statement.objects.count() == 1
    statement = Statement.objects.get()
    assert statement.payload["id"] == str(statement.pk)
    assert "learner@" not in str(statement.payload)
    assert statement.payload["result"]["score"]["scaled"] == 0.8
    assert package.sha256 and package.scorm_version == "1.2"


def test_access_and_legacy_completion_bypass_rejected(setup, acme):
    package, lesson = ready(setup)
    assert launch(lesson, "peer").status_code == 403
    launched = launch(lesson).data["id"]
    assert commit(launched, uid="peer").status_code == 403
    other = make_member(acme, "other")
    foreign = client_for(sign_in(other.firebase_uid), "acme")
    assert foreign.get(f"/api/standards/packages/{package.pk}").status_code == 403
    other.role = Role.INSTRUCTOR
    other.save()
    assert foreign.get(f"/api/standards/packages/{package.pk}").status_code == 404
    assert (
        foreign.post(f"/api/standards/launches/{launched}/commit", {}, format="json").status_code
        == 400
    )
    assert as_("learner").post(f"/api/lessons/{lesson.pk}/complete").status_code == 409
    assert (
        as_("learner")
        .put(f"/api/lessons/{lesson.pk}/runtime", {"cmi": {}}, format="json")
        .status_code
        == 409
    )
    assert (
        as_("teacher")
        .patch(f"/api/lessons/{lesson.pk}", {"contentType": "video"}, format="json")
        .status_code
        == 409
    )
    assert as_("learner").get("/api/standards/packages").status_code == 403
    assert as_("learner").get("/api/standards/deliveries").status_code == 403
    as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    assert Statement.objects.count() == 1
    rls.set_bypass(False)
    rls.set_tenant("acme")
    assert not Package.objects.exists()
    assert not Binding.objects.exists()
    assert not Launch.objects.exists()
    assert not Statement.objects.exists()


def test_feature_flag_and_origin_guards(setup, settings):
    package, lesson = ready(setup)
    settings.STANDARDS_ENABLED = False
    assert launch(lesson).status_code == 503
    assert upload().status_code == 503
    settings.STANDARDS_ENABLED = True
    settings.STANDARDS_CONTENT_ORIGIN = "https://learner.example.test"
    assert launch(lesson).status_code == 503
    settings.STANDARDS_CONTENT_ORIGIN = "https://content.example.test"
    assert as_("learner").post(f"/api/standards/lessons/{lesson.pk}/launch").status_code == 503
    setup.course.status = "draft"
    setup.course.save()
    assert launch(lesson).status_code == 404


@pytest.mark.parametrize("status", ["incomplete", "failed", "browsed", "not attempted"])
def test_exit_status_does_not_complete(setup, status):
    _, lesson = ready(setup)
    response = commit(launch(lesson).data["id"], status)
    assert response.status_code == 200, response.data
    assert response.data["completion"] is None
    assert not Statement.objects.exists()


@pytest.mark.parametrize("status", ["passed", "completed"])
def test_12_completion_status(setup, status):
    _, lesson = ready(setup)
    response = commit(launch(lesson).data["id"], status)
    assert response.status_code == 200
    assert response.data["completion"] is not None


def test_2004_completion_independent_of_termination(setup):
    package, lesson = ready(setup)
    package.scorm_version = "2004"
    package.save()
    launch_id = launch(lesson).data["id"]
    assert commit(launch_id, "incomplete", version="2004").data["completion"] is None
    assert commit(launch_id, "completed", 2, version="2004").data["completion"]


@pytest.mark.parametrize("score", ["NaN", "Infinity", -1, 101, "bad"])
def test_invalid_scores_cannot_write_progress(setup, score):
    _, lesson = ready(setup)
    response = commit(launch(lesson).data["id"], "completed", score=score)
    assert response.status_code == 400
    assert not LessonProgress.objects.filter(lesson=lesson).exists()
    assert not Statement.objects.exists()


def test_content_routes_are_isolated_and_revocable(setup, settings):
    package, lesson = ready(setup)
    launched = Launch.objects.get(pk=launch(lesson).data["id"])
    token = content_token(launched)
    assert as_("learner").get(f"/launch/{token}/").status_code == 404
    settings.ROOT_URLCONF = "apps.standards.content_urls"
    client = Client()
    assert client.get("/api/courses").status_code == 404
    response = client.get(f"/launch/{token}/")
    assert response.status_code == 200
    assert b"token-learner" not in response.content
    assert response["Referrer-Policy"] == "no-referrer"
    assert "https://learner.example.test" in response["Content-Security-Policy"]
    response = client.get(f"/launch/{token}/files/index.html")
    assert response.status_code == 200
    assert client.get(f"/launch/{token}/files/upload.zip").status_code == 404
    assert client.get(f"/launch/{token}/files/%2e%2e/upload.zip").status_code == 404
    assert client.get(f"/launch/{token}tampered/").status_code == 404
    launched.revoked = True
    launched.save()
    assert client.get(f"/launch/{token}/files/index.html").status_code == 404


def test_archiving_revokes_active_launches(setup):
    package, lesson = ready(setup)
    launched = launch(lesson).data["id"]
    response = as_("teacher").delete(f"/api/standards/packages/{package.pk}")
    assert response.status_code == 204
    assert commit(launched).status_code == 403
    assert launch(lesson).status_code == 404


def test_processing_package_cannot_be_archived_or_attached(setup):
    response = upload()
    package_id = response.data["id"]
    Package.objects.filter(pk=package_id).update(status=Package.Status.PROCESSING)
    assert as_("teacher").delete(f"/api/standards/packages/{package_id}").status_code == 409
    response = as_("teacher").post(
        f"/api/standards/packages/{package_id}/attach",
        {"moduleId": str(setup.module.pk), "title": "SCORM demo"},
        format="json",
    )
    assert response.status_code == 404


@pytest.mark.parametrize("path", ["../evil", "/evil", "folder\\evil", "%2e%2e/evil", "a//b"])
def test_unsafe_zip_paths_rejected(path):
    with pytest.raises(InvalidPackage, match="unsafe"):
        inspect_zip(package_zip(extra={path: b"bad"}))


@pytest.mark.parametrize(
    "manifest",
    [
        MANIFEST.replace('href="index.html"', 'href="https://evil.test/sco.html"'),
        MANIFEST.replace("<metadata>", "<metadata><sequencing/>"),
        MANIFEST.replace('scormtype="sco"', 'scormtype="asset"'),
        MANIFEST.replace('identifierref="sco"', 'identifierref="missing"'),
        MANIFEST.replace('href="index.html"', 'href="missing.html"'),
        "<!DOCTYPE a [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><manifest>&x;</manifest>",
        "<manifest>",
    ],
)
def test_invalid_or_unsupported_manifests_rejected(manifest):
    with pytest.raises(InvalidPackage):
        inspect_zip(package_zip(manifest))


def test_import_failure_is_visible(setup):
    response = as_("teacher").post(
        "/api/standards/packages",
        {"title": "Bad", "file": SimpleUploadedFile("bad.zip", b"not a zip")},
        format="multipart",
    )
    assert response.status_code == 202
    call_command("process_scorm")
    package = Package.objects.get(pk=response.data["id"])
    assert package.status == "failed"
    assert package.error


def test_native_completion_is_transactional_and_deduplicated(setup):
    response = as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    assert response.status_code == 200
    assert Statement.objects.count() == 1
    as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    assert Statement.objects.count() == 1


def test_outbox_rolls_back_with_failed_progress_transaction(setup, monkeypatch):
    def broken_award(**kwargs):
        raise RuntimeError("Simulated award failure")

    monkeypatch.setattr("apps.learning.progress.award_lesson", broken_award)
    with pytest.raises(RuntimeError, match="Simulated"):
        as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    assert not Statement.objects.exists()
    assert not LessonProgress.objects.exists()


def test_lrs_delivery_ids_and_retries_are_stable(setup, settings, monkeypatch):
    as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    statement = Statement.objects.get()
    settings.XAPI_LRS_ENDPOINT = "https://lrs.example.test/xapi"
    settings.XAPI_LRS_AUTH = "Basic test-only"
    put = Mock(side_effect=requests.Timeout())
    monkeypatch.setattr("requests.Session.put", put)
    call_command("forward_xapi")
    statement.refresh_from_db()
    assert statement.attempts == 1 and statement.delivered_at is None
    assert statement.last_error == "LRS transport: Timeout"
    initial_data = put.call_args.kwargs["data"]
    assert put.call_args.kwargs["params"]["statementId"] == str(statement.pk)
    assert put.call_args.kwargs["allow_redirects"] is False
    statement.next_attempt_at = timezone.now()
    statement.save()
    response = Mock(status_code=204)
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    put.side_effect = None
    put.return_value = response
    call_command("forward_xapi")
    statement.refresh_from_db()
    assert statement.attempts == 2 and statement.delivered_at is not None
    assert put.call_args.kwargs["data"] == initial_data
    call_command("forward_xapi")
    assert put.call_count == 2


def test_missing_lrs_is_an_explicit_operator_error(settings):
    settings.XAPI_LRS_ENDPOINT = ""
    settings.XAPI_LRS_AUTH = ""
    with pytest.raises(CommandError, match="XAPI_LRS_ENDPOINT"):
        call_command("forward_xapi")


def test_s3_private_adapter_contract(settings, monkeypatch):
    settings.STANDARDS_LOCAL_ROOT = ""
    settings.STANDARDS_S3_ENDPOINT = "https://bucket.example.test"
    settings.STANDARDS_S3_BUCKET = "private-courses"
    settings.STANDARDS_S3_ACCESS_KEY = "test-key"
    settings.STANDARDS_S3_SECRET_KEY = "test-secret"
    s3 = storage.client()
    assert s3.meta.config.signature_version == "s3v4"
    assert s3.meta.config.s3["addressing_style"] == "path"
    monkeypatch.setattr(storage, "client", lambda: s3)
    with Stubber(s3) as stub:
        stub.add_response(
            "put_object",
            {},
            {"Bucket": "private-courses", "Key": "standards/a/test/upload.zip", "Body": b"ZIP"},
        )
        storage.put("standards/a/test/upload.zip", b"ZIP")
        stub.add_response(
            "get_object",
            {"Body": io.BytesIO(b"ZIP")},
            {"Bucket": "private-courses", "Key": "standards/a/test/upload.zip"},
        )
        assert storage.get("standards/a/test/upload.zip", limit=3) == b"ZIP"
        stub.add_client_error("put_object", service_error_code="AccessDenied")
        with pytest.raises(storage.StorageUnavailable):
            storage.put("standards/a/test/upload.zip", b"ZIP")
        stub.assert_no_pending_responses()


def test_missing_storage_and_unsafe_transport_do_not_fall_back(settings):
    settings.STANDARDS_LOCAL_ROOT = ""
    settings.STANDARDS_S3_ENDPOINT = ""
    with pytest.raises(storage.StorageUnavailable):
        storage.put("test", b"test")
    settings.STANDARDS_S3_ENDPOINT = "http://insecure.example.test"
    settings.STANDARDS_S3_BUCKET = "bucket"
    settings.STANDARDS_S3_ACCESS_KEY = "key"
    settings.STANDARDS_S3_SECRET_KEY = "test"
    with pytest.raises(storage.StorageUnavailable, match="HTTPS"):
        storage.client()


@pytest.mark.parametrize("status", [301, 400, 409, 429, 500])
def test_non_success_lrs_responses_remain_pending(setup, settings, monkeypatch, status):
    as_("learner").post(f"/api/lessons/{setup.video.pk}/complete")
    settings.XAPI_LRS_ENDPOINT = "https://lrs.example.test/xapi"
    settings.XAPI_LRS_AUTH = "Basic test-only"
    response = Mock(status_code=status)
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    monkeypatch.setattr("requests.Session.put", Mock(return_value=response))
    call_command("forward_xapi")
    statement = Statement.objects.get()
    assert statement.delivered_at is None
    assert statement.last_error == f"LRS HTTP {status}"
    assert statement.next_attempt_at > timezone.now()


def test_package_entry_limit_and_compression_bomb():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for index in range(2001):
            archive.writestr(f"{index}.txt", "")
    with pytest.raises(InvalidPackage, match="2,000"):
        inspect_zip(buffer.getvalue())
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("bomb.txt", b"0" * 1_000_000)
    with pytest.raises(InvalidPackage, match="compression ratio"):
        inspect_zip(buffer.getvalue())


def test_runtime_limit_and_feature_disable_after_launch(setup, settings):
    _, lesson = ready(setup)
    launched = launch(lesson).data["id"]
    response = as_("learner").post(
        f"/api/standards/launches/{launched}/commit",
        {"sequence": 1, "cmi": {"cmi": {"suspend_data": "x" * 64_000}}},
        format="json",
    )
    assert response.status_code == 400
    settings.STANDARDS_ENABLED = False
    assert commit(launched).status_code == 503


def test_configuration_is_staff_only_and_never_returns_secrets(setup):
    assert as_("learner").get("/api/standards/configuration").status_code == 403
    response = as_("teacher").get("/api/standards/configuration")
    assert response.status_code == 200
    assert response.data["storageConfigured"] is True
    assert set(response.data.values()) <= {True, False}


@pytest.mark.skipif(os.environ.get("SCORM_BROWSER") != "1", reason="Opt-in installed Chrome smoke")
@pytest.mark.parametrize("version", ["1.2", "2004"])
def test_real_chrome_runtime_commit_exit_and_resume(setup, settings, version):
    package, lesson = ready(setup)
    package.scorm_version = version
    package.save()
    settings.ROOT_URLCONF = "apps.standards.content_urls"
    settings.STANDARDS_APP_ORIGINS = ["http://127.0.0.1:__PORT__"]
    enrollment = Enrollment.objects.get(member__firebase_uid="learner")
    binding = Binding.objects.get(lesson=lesson)
    runtime = {}
    for resume in (False, True):
        from datetime import timedelta

        launched = Launch.objects.create(
            tenant=enrollment.tenant,
            enrollment=enrollment,
            binding=binding,
            expires_at=timezone.now() + timedelta(hours=1),
            runtime=runtime,
        )
        response = Client().get(f"/launch/{content_token(launched)}/")
        assert response.status_code == 200
        node = shutil.which("node")
        assert node, "Node is required for the Chrome smoke test."
        result = subprocess.run(  # noqa: S603 - fixed repository-owned browser test harness
            [node, str(Path(__file__).with_name("standards_browser.mjs"))],
            input=json.dumps(
                {
                    "html": response.content.decode(),
                    "runtimePath": settings.SCORM_RUNTIME_PATH,
                    "csp": response["Content-Security-Policy"],
                    "resume": resume,
                    "version": version,
                }
            ),
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        observed = json.loads(result.stdout)
        assert observed["commits"]
        settings.ROOT_URLCONF = "forge.urls"
        for message in observed["commits"]:
            saved = as_("learner").post(
                f"/api/standards/launches/{launched.pk}/commit",
                {"sequence": message["sequence"], "cmi": message["cmi"]},
                format="json",
            )
            assert saved.status_code == 200, saved.data
            assert bool(saved.data["completion"]) == resume
        progress = LessonProgress.objects.get(lesson=lesson)
        runtime = progress.runtime
        assert runtime["cmi"]["suspend_data"] == "page=2"
        assert bool(progress.completed_at) == resume
        settings.ROOT_URLCONF = "apps.standards.content_urls"
