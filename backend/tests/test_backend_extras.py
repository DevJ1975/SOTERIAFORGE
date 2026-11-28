"""Enrollment report, course library sharing, platform analytics and file assets."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.accounts.models import Member, Role
from apps.assessments.models import Quiz
from apps.assets.models import Asset
from apps.audit.models import AuditEntry
from apps.games.models import Game
from apps.learning.models import Course, Enrollment, Lesson, Module
from apps.tenants import rls
from apps.tenants.models import Tenant
from conftest import client_for, make_member, sign_in
from tests.content import build_course

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(lakewood):
    return {
        "admin": make_member(lakewood, "jamil", Role.TENANT_ADMIN),
        "instructor": make_member(lakewood, "ta", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "marcus"),
    }


@pytest.fixture
def superadmin(db):
    return Member.objects.create(email="root@example.com", role=Role.SUPERADMIN, tenant=None)


def as_(uid):
    return client_for(sign_in(uid))


def root(tenant=None):
    return client_for(sign_in("root"), tenant=tenant)


# --- reports/enrollments ---------------------------------------------------
def test_enrollment_report_lists_rows_for_staff_only(people, acme):
    c = build_course(people["learner"].tenant, people["admin"])
    Enrollment.objects.create(
        tenant=c.course.tenant,
        course=c.course,
        member=people["learner"],
        progress_pct=40,
        last_activity_at=timezone.now(),
    )
    other = make_member(acme, "wile")
    other_course = Course.objects.create(tenant=acme, title="Other")
    Enrollment.objects.create(tenant=acme, course=other_course, member=other)

    res = as_("ta").get("/api/reports/enrollments")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1  # acme's enrollment is invisible
    assert rows[0]["memberId"] == str(people["learner"].pk)
    assert rows[0]["email"] == "marcus@example.com"
    assert rows[0]["courseTitle"] == "AI Cyber Defender"
    assert rows[0]["progressPct"] == 40
    assert rows[0]["completedAt"] is None and rows[0]["dueAt"] is None

    assert as_("jamil").get("/api/reports/enrollments").status_code == 200
    assert as_("marcus").get("/api/reports/enrollments").status_code == 403
    assert client_for().get("/api/reports/enrollments").status_code in (401, 403)


def test_enrollment_report_filters_by_course_and_ignores_bad_ids(people):
    c = build_course(people["learner"].tenant, people["admin"])
    Enrollment.objects.create(tenant=c.course.tenant, course=c.course, member=people["learner"])
    admin = as_("jamil")
    assert len(admin.get(f"/api/reports/enrollments?courseId={c.course.pk}").json()) == 1
    assert admin.get("/api/reports/enrollments?courseId=nope").json() == []


def test_superadmin_reports_the_tenant_named_in_the_header(people):
    c = build_course(people["learner"].tenant, people["admin"])
    Enrollment.objects.create(tenant=c.course.tenant, course=c.course, member=people["learner"])
    Member.objects.create(email="root@example.com", role=Role.SUPERADMIN, tenant=None)
    assert len(root("lakewood").get("/api/reports/enrollments").json()) == 1


# --- library tenant --------------------------------------------------------
def test_library_tenant_exists_archived_and_is_hidden(superadmin):
    library = Tenant.objects.get(pk="library")
    assert library.status == Tenant.Status.ARCHIVED
    ids = [t["id"] for t in root().get("/api/tenants").json()]
    assert "library" not in ids
    assert (
        root().patch("/api/tenants/library", {"status": "active"}, format="json").status_code == 404
    )
    dup = root().post("/api/tenants", {"id": "library", "name": "x"}, format="json")
    assert dup.status_code == 400


def test_tenant_members_cannot_use_the_library_header(people):
    res = client_for(sign_in("marcus"), tenant="library").get("/api/courses")
    assert res.status_code == 403


def test_superadmin_authors_in_the_library_with_the_tenant_header(superadmin):
    res = root("library").post("/api/courses", {"title": "Shared 101"}, format="json")
    assert res.status_code == 201
    assert Course.objects.get(pk=res.json()["id"]).tenant_id == "library"
    listed = root().get("/api/library/courses")
    assert [c["title"] for c in listed.json()] == ["Shared 101"]


def library_course(superadmin):
    course = Course.objects.create(
        tenant_id="library", title="Library AI", description="d", tags=["ai"], status="published"
    )
    module = Module.objects.create(tenant_id="library", course=course, title="M1", order=1)
    quiz = Quiz.objects.create(
        tenant_id="library", title="Q", questions=[{"id": "x"}], pass_threshold=80
    )
    game = Game.objects.create(tenant_id="library", title="G", config={"a": 1})
    asset = Asset.objects.create(
        tenant_id="library",
        key="assets/library/x",
        filename="v.mp4",
        content_type="video/mp4",
        size=5,
    )
    Lesson.objects.create(
        tenant_id="library", module=module, title="L1", order=1, content_type="quiz", quiz=quiz
    )
    Lesson.objects.create(
        tenant_id="library", module=module, title="L2", order=2, content_type="quiz", quiz=quiz
    )
    Lesson.objects.create(
        tenant_id="library",
        module=module,
        title="L3",
        order=3,
        content_type="game",
        asset_ref=str(game.pk),
    )
    Lesson.objects.create(
        tenant_id="library",
        module=module,
        title="L4",
        order=4,
        content_type="video",
        asset_ref=asset.ref,
    )
    return course


def test_share_copies_a_course_as_drafts_into_each_tenant(superadmin, lakewood, acme):
    course = library_course(superadmin)
    existing = Course.objects.create(tenant=lakewood, title="Library AI", status="published")

    res = root().post(
        f"/api/library/courses/{course.pk}/share",
        {"tenantIds": ["lakewood", "acme", "acme"]},
        format="json",
    )
    assert res.status_code == 201
    created = {c["tenantId"]: c["courseId"] for c in res.json()["created"]}
    assert set(created) == {"lakewood", "acme"}

    for tenant_id, course_id in created.items():
        copy = Course.objects.get(pk=course_id)
        assert copy.tenant_id == tenant_id and copy.status == "draft"
        assert copy.pk != course.pk
        lessons = list(Lesson.objects.filter(module__course=copy).order_by("order"))
        assert [lesson.title for lesson in lessons] == ["L1", "L2", "L3", "L4"]
        assert all(lesson.tenant_id == tenant_id for lesson in lessons)
        # One shared quiz copy, owned by the tenant; the library original is untouched.
        assert lessons[0].quiz_id == lessons[1].quiz_id
        quiz = Quiz.objects.get(pk=lessons[0].quiz_id)
        assert quiz.tenant_id == tenant_id and quiz.pass_threshold == 80
        game = Game.objects.get(pk=lessons[2].asset_ref)
        assert game.tenant_id == tenant_id and game.config == {"a": 1}
        asset = Asset.objects.get(pk=lessons[3].asset_ref.removeprefix("asset:"))
        assert asset.tenant_id == tenant_id and asset.key == "assets/library/x"
        entry = AuditEntry.objects.get(action="library.course.shared", tenant_id=tenant_id)
        assert entry.target_id == course_id and entry.details["sourceCourseId"] == str(course.pk)

    existing.refresh_from_db()
    assert existing.status == "published"  # never overwritten
    assert Course.objects.filter(tenant=lakewood, title="Library AI").count() == 2
    assert Lesson.objects.filter(module__course=course).count() == 4


def test_share_keeps_a_non_uuid_game_reference(superadmin, lakewood):
    course = Course.objects.create(tenant_id="library", title="Legacy", status="published")
    module = Module.objects.create(tenant_id="library", course=course, title="M", order=1)
    for ref in ("legacy-game", ""):
        Lesson.objects.create(
            tenant_id="library",
            module=module,
            title=f"G{ref}",
            order=1,
            content_type="game",
            asset_ref=ref,
        )
    res = root().post(
        f"/api/library/courses/{course.pk}/share", {"tenantIds": ["lakewood"]}, format="json"
    )
    assert res.status_code == 201
    refs = Lesson.objects.filter(tenant=lakewood).values_list("asset_ref", flat=True)
    assert sorted(refs) == ["", "legacy-game"]


def test_share_validates_input_and_is_superadmin_only(superadmin, people, lakewood):
    course = library_course(superadmin)
    url = f"/api/library/courses/{course.pk}/share"
    assert root().post(url, {"tenantIds": ["ghost"]}, format="json").status_code == 400
    assert root().post(url, {"tenantIds": ["library"]}, format="json").status_code == 400
    assert root().post(url, {"tenantIds": []}, format="json").status_code == 400
    assert Course.objects.filter(tenant=lakewood).count() == 0
    body = {"tenantIds": ["lakewood"]}
    assert as_("jamil").post(url, body, format="json").status_code == 403
    assert as_("jamil").get("/api/library/courses").status_code == 403
    # Only library courses can be shared.
    own = Course.objects.create(tenant=lakewood, title="Mine")
    res = root().post(f"/api/library/courses/{own.pk}/share", body, format="json")
    assert res.status_code == 404


def test_share_failure_rolls_back_every_tenant(superadmin, lakewood):
    course = library_course(superadmin)
    res = root().post(
        f"/api/library/courses/{course.pk}/share",
        {"tenantIds": ["lakewood", "ghost"]},
        format="json",
    )
    assert res.status_code == 400
    assert Course.objects.filter(tenant=lakewood).count() == 0


# --- platform analytics ----------------------------------------------------
def test_platform_analytics_counts_per_tenant(superadmin, people, acme):
    c = build_course(people["learner"].tenant, people["admin"])
    Enrollment.objects.create(tenant=c.course.tenant, course=c.course, member=people["learner"])
    Enrollment.objects.create(
        tenant=c.course.tenant,
        course=c.course,
        member=people["instructor"],
        completed_at=timezone.now(),
        progress_pct=100,
    )
    res = root("acme").get("/api/platform/analytics")  # header must not narrow the counts
    assert res.status_code == 200
    data = res.json()
    rows = {t["tenantId"]: t for t in data["tenants"]}
    assert set(rows) == {"lakewood", "acme"}  # no library
    assert rows["lakewood"] == {
        "tenantId": "lakewood",
        "name": "Lakewood University",
        "status": "active",
        "plan": "starter",
        "members": 3,
        "learners": 1,
        "enrollments": 2,
        "completions": 1,
        "completionRate": 50.0,
    }
    assert rows["acme"]["members"] == 0 and rows["acme"]["completionRate"] == 0
    assert data["totals"] == {
        "tenants": 2,
        "members": 3,
        "learners": 1,
        "enrollments": 2,
        "completions": 1,
        "completionRate": 50.0,
    }
    assert data["generatedAt"]


def test_platform_analytics_is_superadmin_only(people):
    assert as_("jamil").get("/api/platform/analytics").status_code == 403
    assert client_for().get("/api/platform/analytics").status_code in (401, 403)


# --- assets ----------------------------------------------------------------
@pytest.fixture
def local_storage(settings, tmp_path):
    settings.DEBUG = True
    settings.STANDARDS_LOCAL_ROOT = str(tmp_path)
    return tmp_path


def upload(client, name="clip.mp4", data=b"0123456789", content_type="video/mp4"):
    return client.post(
        "/api/assets",
        {"file": SimpleUploadedFile(name, data, content_type=content_type)},
        format="multipart",
    )


def test_staff_upload_stores_the_file_and_audits(people, local_storage):
    res = upload(as_("ta"))
    assert res.status_code == 201
    body = res.json()
    assert body["assetRef"] == f"asset:{body['id']}"
    assert body["filename"] == "clip.mp4" and body["size"] == 10
    asset = Asset.objects.get(pk=body["id"])
    assert asset.tenant_id == "lakewood" and asset.created_by == people["instructor"]
    assert (local_storage / asset.key).read_bytes() == b"0123456789"
    assert AuditEntry.objects.filter(action="assets.asset.uploaded", target_id=body["id"]).exists()
    assert [a["id"] for a in as_("jamil").get("/api/assets").json()] == [body["id"]]


def test_learners_cannot_upload_or_list(people, local_storage):
    assert upload(as_("marcus")).status_code == 403
    assert as_("marcus").get("/api/assets").status_code == 403
    assert Asset.objects.count() == 0


@pytest.mark.parametrize(
    ("name", "content_type"),
    [
        ("page.html", "text/html"),
        ("x.svg", "image/svg+xml"),
        ("run.js", "application/javascript"),
        ("tool.exe", "application/octet-stream"),
    ],
)
def test_upload_rejects_bad_types_and_path_tricks(people, local_storage, name, content_type):
    assert upload(as_("ta"), name=name, content_type=content_type).status_code == 400
    assert Asset.objects.count() == 0


@pytest.mark.parametrize("name", ["../evil.mp4", "a\\b.mp4", "..", "", "a\x00b.mp4", "x" * 256])
def test_filename_check_rejects_path_tricks(name):
    from rest_framework.exceptions import ValidationError

    from apps.assets.views import check_filename

    with pytest.raises(ValidationError):
        check_filename(name)


def test_uploaded_path_is_reduced_to_a_base_name_and_never_used_in_the_key(people, local_storage):
    res = upload(as_("ta"), name="../../evil.mp4")
    assert res.status_code == 201 and res.json()["filename"] == "evil.mp4"
    assert ".." not in Asset.objects.get().key


def test_upload_accepts_allowed_types(people, local_storage):
    for name, ctype in [
        ("a.png", "image/png"),
        ("a.mp3", "audio/mpeg"),
        ("a.pdf", "application/pdf"),
        ("a.zip", "application/zip"),
        ("a.json", "application/json"),
        ("a.txt", "text/plain"),
    ]:
        assert upload(as_("ta"), name=name, content_type=ctype).status_code == 201, name


def test_upload_enforces_size_limit_and_rejects_empty(people, local_storage, monkeypatch):
    monkeypatch.setattr("apps.assets.views.MAX_UPLOAD_BYTES", 5)
    assert upload(as_("ta"), data=b"123456").status_code == 400
    assert upload(as_("ta"), data=b"").status_code == 400
    assert upload(as_("ta"), data=b"12345").status_code == 201


def test_signed_url_is_tenant_scoped_and_local_content_needs_the_signature(
    people, local_storage, acme
):
    asset_id = upload(as_("ta")).json()["id"]
    res = as_("marcus").get(f"/api/assets/{asset_id}/url")  # learners may read
    assert res.status_code == 200 and res.json()["expiresIn"] == 900
    url = res.json()["url"]
    assert url.startswith("http://testserver/api/assets/")
    anon = client_for()
    served = anon.get(url.removeprefix("http://testserver"))
    assert served.status_code == 200
    assert b"".join(served.streaming_content) == b"0123456789"
    assert served["Content-Type"] == "video/mp4"
    assert anon.get(f"/api/assets/{asset_id}/content").status_code == 404
    assert anon.get(f"/api/assets/{asset_id}/content?sig=garbage").status_code == 404

    make_member(acme, "wile")
    other = client_for(sign_in("wile"), tenant="acme")
    assert other.get(f"/api/assets/{asset_id}/url").status_code == 404
    assert as_("ta").get("/api/assets/00000000-0000-0000-0000-000000000000/url").status_code == 404


def test_signed_url_uses_a_presigned_s3_url_in_production(people, settings, monkeypatch):
    settings.STANDARDS_LOCAL_ROOT = ""
    settings.STANDARDS_S3_ENDPOINT = "https://s3.example.com"
    settings.STANDARDS_S3_BUCKET = "forge"
    settings.STANDARDS_S3_ACCESS_KEY = "AKIATEST"
    settings.STANDARDS_S3_SECRET_KEY = "secret-test"
    from apps.standards import storage

    monkeypatch.setattr(storage, "put_stream", lambda key, stream, content_type: None)
    asset_id = upload(as_("ta"), name="my clip.mp4").json()["id"]
    url = as_("marcus").get(f"/api/assets/{asset_id}/url").json()["url"]
    assert url.startswith("https://s3.example.com/forge/assets/lakewood/")
    assert "X-Amz-Signature=" in url and "X-Amz-Expires=900" in url
    assert "clip.mp4" in url


def test_assets_are_row_level_isolated(people, local_storage, acme):
    upload(as_("ta"))
    rls.set_bypass(False)
    assert Asset.objects.count() == 0
    rls.set_tenant("acme")
    assert Asset.objects.count() == 0
    rls.set_tenant("lakewood")
    assert Asset.objects.count() == 1
