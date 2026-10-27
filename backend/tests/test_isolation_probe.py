"""Adversarial checks on the admin, library, report and asset endpoints:
tenant isolation, role boundaries, and hostile input."""

import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import Member, Role
from apps.assets.models import Asset
from apps.games.models import Game
from apps.learning.models import Course
from apps.tenants.models import Tenant
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


@pytest.fixture
def world(lakewood, acme):
    return {
        "admin": make_member(lakewood, "jamil", Role.TENANT_ADMIN),
        "ta": make_member(lakewood, "ta", Role.INSTRUCTOR),
        "learner": make_member(lakewood, "marcus"),
        "acme_admin": make_member(acme, "wile", Role.TENANT_ADMIN),
        "acme_learner": make_member(acme, "road"),
        "root": Member.objects.create(email="root@example.com", role=Role.SUPERADMIN, tenant=None),
    }


def as_(uid, tenant=None):
    return client_for(sign_in(uid), tenant=tenant)


@pytest.fixture
def local_storage(settings, tmp_path):
    settings.DEBUG = True
    settings.STANDARDS_LOCAL_ROOT = str(tmp_path)
    return tmp_path


ADMIN_ONLY = [
    ("post", "/api/members/invite", {"email": "n@example.com", "role": "learner"}),
    ("patch", "/api/members/{m}/role", {"role": "instructor"}),
    ("patch", "/api/members/{m}/status", {"status": "deactivated"}),
    ("put", "/api/tenants/lakewood/branding", {"colors": {}}),
]
SUPER_ONLY = [
    ("get", "/api/tenants", None),
    ("post", "/api/tenants", {"id": "newco", "name": "New"}),
    ("patch", "/api/tenants/lakewood", {"name": "x"}),
    ("get", "/api/platform/analytics", None),
    ("get", "/api/library/courses", None),
    ("post", f"/api/library/courses/{uuid.uuid4()}/share", {"tenantIds": ["acme"]}),
    ("post", "/api/members/{m}/erase", {"confirm": True}),
]
STAFF_ONLY = [
    ("get", "/api/members", None),
    ("get", "/api/reports/enrollments", None),
    ("get", "/api/assets", None),
    ("post", "/api/games", {"title": "g", "engine": "cards", "config": {}}),
]


def call(client, method, url, body, member):
    return getattr(client, method)(url.format(m=member.pk), body, format="json")


@pytest.mark.parametrize(("method", "url", "body"), ADMIN_ONLY + SUPER_ONLY)
def test_instructor_and_learner_cannot_use_admin_or_superadmin_routes(world, method, url, body):
    for uid in ("ta", "marcus"):
        res = call(as_(uid), method, url, body, world["learner"])
        assert res.status_code == 403, (uid, url, res.status_code)


@pytest.mark.parametrize(("method", "url", "body"), SUPER_ONLY)
def test_tenant_admin_cannot_use_superadmin_routes(world, method, url, body):
    res = call(as_("jamil"), method, url, body, world["learner"])
    assert res.status_code == 403


@pytest.mark.parametrize(("method", "url", "body"), STAFF_ONLY)
def test_learner_cannot_use_staff_routes(world, method, url, body):
    assert call(as_("marcus"), method, url, body, world["learner"]).status_code == 403


@pytest.mark.parametrize(("method", "url", "body"), ADMIN_ONLY + SUPER_ONLY + STAFF_ONLY)
def test_anonymous_is_rejected_everywhere(world, method, url, body):
    res = call(client_for(), method, url, body, world["learner"])
    assert res.status_code in (401, 403)


def test_tenant_admin_cannot_touch_another_tenants_member(world):
    admin = as_("jamil")
    victim = world["acme_learner"]
    assert (
        admin.patch(f"/api/members/{victim.pk}/role", {"role": "tenant_admin"}).status_code == 404
    )
    assert (
        admin.patch(f"/api/members/{victim.pk}/status", {"status": "deactivated"}).status_code
        == 404
    )
    assert admin.get(f"/api/members/{victim.pk}/export").status_code == 404
    assert admin.post(f"/api/members/{victim.pk}/erase", {"confirm": True}).status_code == 403
    victim.refresh_from_db()
    assert victim.role == Role.LEARNER and victim.status != Member.Status.DEACTIVATED


def test_tenant_admin_cannot_target_the_superadmin_or_use_a_foreign_header(world):
    admin = as_("jamil")
    root = world["root"]
    assert admin.patch(f"/api/members/{root.pk}/role", {"role": "learner"}).status_code == 404
    assert admin.get(f"/api/members/{root.pk}/export").status_code == 404
    for target in ("acme", "library"):
        res = as_("jamil", tenant=target).get("/api/members")
        assert res.status_code == 403


def test_nobody_can_be_made_superadmin_through_the_api(world):
    admin = as_("jamil")
    assert (
        admin.patch(f"/api/members/{world['ta'].pk}/role", {"role": "superadmin"}).status_code
        == 400
    )
    res = admin.post("/api/members/invite", {"email": "x@example.com", "role": "superadmin"})
    assert res.status_code == 400


def test_instructor_cannot_export_a_colleague_or_erase(world):
    ta = as_("ta")
    assert ta.get(f"/api/members/{world['learner'].pk}/export").status_code == 403
    assert (
        ta.post(f"/api/members/{world['learner'].pk}/erase", {"confirm": True}).status_code == 403
    )


def test_superadmin_in_a_tenant_header_cannot_erase_a_member_of_another_tenant(world):
    res = as_("root", tenant="lakewood").post(
        f"/api/members/{world['acme_learner'].pk}/erase", {"confirm": True}
    )
    assert res.status_code == 404
    world["acme_learner"].refresh_from_db()
    assert world["acme_learner"].email == "road@example.com"


def test_superadmin_exports_and_erases_with_no_header(world):
    root = as_("root")
    assert root.get(f"/api/members/{world['root'].pk}/export").status_code == 200
    assert root.post(f"/api/members/{world['root'].pk}/erase", {"confirm": True}).status_code == 403
    assert (
        root.post(f"/api/members/{world['acme_learner'].pk}/erase", {"confirm": True}).status_code
        == 204
    )


def test_erased_member_cannot_sign_in_or_use_their_token(world):
    token = sign_in("road")
    as_("root").post(f"/api/members/{world['acme_learner'].pk}/erase", {"confirm": True})
    assert client_for(token).get("/api/me").status_code in (401, 403)


def test_library_tenant_cannot_host_a_working_session(world):
    library = Tenant.objects.get(pk="library")
    member = make_member(library, "ghost", Role.TENANT_ADMIN)
    assert client_for(sign_in("ghost")).get("/api/members").status_code == 403
    assert member.tenant_id == "library"
    assert client_for(tenant="library").get("/api/tenant/branding").status_code == 404
    names = [t["id"] for t in as_("root").get("/api/tenants").json()]
    assert "library" not in names
    assert as_("root").patch("/api/tenants/library", {"status": "active"}).status_code == 404
    res = as_("root").post("/api/tenants", {"id": "library", "name": "x"})
    assert res.status_code == 400


def test_suspended_tenant_admin_is_locked_out(world, lakewood):
    lakewood.status = Tenant.Status.SUSPENDED
    lakewood.save()
    assert as_("jamil").get("/api/members").status_code == 403
    assert (
        as_("jamil")
        .put("/api/tenants/lakewood/branding", {"colors": {}}, format="json")
        .status_code
        == 403
    )


def test_cannot_share_a_customer_course_or_into_the_library(world, lakewood):
    course = Course.objects.create(tenant=lakewood, title="Customer course")
    root = as_("root")
    res = root.post(
        f"/api/library/courses/{course.pk}/share", {"tenantIds": ["acme"]}, format="json"
    )
    assert res.status_code == 404
    assert Course.objects.filter(tenant_id="acme").count() == 0


@pytest.mark.parametrize(
    "value",
    [
        "red; background:url(//evil.example/x)",
        "url(https://evil.example/x)",
        "red}body{display:none",
        r"red\;",
        "red /* x */",
        "@import 'x'",
    ],
)
def test_branding_rejects_css_injection(world, value):
    res = as_("jamil").put(
        "/api/tenants/lakewood/branding", {"colors": {"--brand": value}}, format="json"
    )
    assert res.status_code == 400, value


@pytest.mark.parametrize("name", ["--a;b", "color", "--A", "--x: red; --y"])
def test_branding_rejects_bad_token_names(world, name):
    res = as_("jamil").put(
        "/api/tenants/lakewood/branding", {"colors": {name: "red"}}, format="json"
    )
    assert res.status_code == 400, name


@pytest.mark.parametrize("font", ["Arial; x:y", "a}b", "a\nb"])
def test_branding_rejects_bad_fonts(world, font):
    res = as_("jamil").put("/api/tenants/lakewood/branding", {"fontFamily": font}, format="json")
    assert res.status_code == 400, font


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "http://insecure.example/x", "data:text/html,x"]
)
def test_branding_rejects_non_https_urls(world, url):
    res = as_("jamil").put("/api/tenants/lakewood/branding", {"logoUrl": url}, format="json")
    assert res.status_code == 400


def upload(client, name="a.png", data=b"x", content_type="image/png"):
    return client.post(
        "/api/assets",
        {"file": SimpleUploadedFile(name, data, content_type=content_type)},
        format="multipart",
    )


@pytest.mark.parametrize(
    "content_type",
    [
        "text/html",
        "image/svg+xml",
        "IMAGE/SVG+XML; charset=utf-8",
        "application/javascript",
        "application/xhtml+xml",
        "text/xml",
        "application/x-msdownload",
    ],
)
def test_upload_blocks_active_content_types(world, local_storage, content_type):
    assert upload(as_("ta"), content_type=content_type).status_code == 400


def test_upload_with_no_declared_type_is_judged_by_the_file_name(world, local_storage):
    assert upload(as_("ta"), name="x.html", content_type="").status_code == 400
    assert upload(as_("ta"), name="x.svg", content_type="").status_code == 400


def test_upload_with_garbage_content_length_is_a_client_error(world, local_storage):
    res = as_("ta").post(
        "/api/assets",
        {"file": SimpleUploadedFile("a.png", b"x", content_type="image/png")},
        format="multipart",
        CONTENT_LENGTH="not-a-number",
    )
    assert res.status_code < 500


def test_asset_urls_do_not_cross_tenants_or_to_anonymous(world, local_storage):
    asset_id = upload(as_("ta")).json()["id"]
    assert as_("road").get(f"/api/assets/{asset_id}/url").status_code == 404
    assert as_("wile").get(f"/api/assets/{asset_id}/url").status_code == 404
    assert client_for().get(f"/api/assets/{asset_id}/url").status_code in (401, 403)
    assert as_("root").get(f"/api/assets/{asset_id}/url").status_code == 403  # no tenant named
    assert as_("root", tenant="acme").get(f"/api/assets/{asset_id}/url").status_code == 404
    assert as_("marcus").get(f"/api/assets/{asset_id}/url").status_code == 200
    # a signature for one asset never opens another, and a forged one never opens any
    other = upload(as_("ta"), name="b.png").json()["id"]
    url = as_("marcus").get(f"/api/assets/{asset_id}/url").json()["url"]
    sig = url.split("sig=")[1]
    assert client_for().get(f"/api/assets/{other}/content?sig={sig}").status_code == 404
    assert client_for().get(f"/api/assets/{asset_id}/content?sig={sig}x").status_code == 404


def test_asset_content_is_served_with_nosniff_and_never_unsigned(world, local_storage):
    asset_id = upload(as_("ta")).json()["id"]
    assert client_for().get(f"/api/assets/{asset_id}/content").status_code == 404
    url = as_("marcus").get(f"/api/assets/{asset_id}/url").json()["url"]
    res = client_for().get(url.split("testserver")[1])
    assert res.status_code == 200 and res["X-Content-Type-Options"] == "nosniff"


def test_game_and_course_ids_do_not_cross_tenants(world, acme):
    game = Game.objects.create(tenant=acme, title="Theirs", engine="cards", config={})
    admin = as_("jamil")
    assert admin.get(f"/api/games/{game.pk}").status_code == 404
    assert admin.patch(f"/api/games/{game.pk}", {"title": "mine"}, format="json").status_code == 404
    assert admin.delete(f"/api/games/{game.pk}").status_code == 404
    course = Course.objects.create(tenant=acme, title="Theirs")
    assert admin.get(f"/api/courses/{course.pk}").status_code == 404
    assert (
        admin.patch(f"/api/courses/{course.pk}", {"title": "x"}, format="json").status_code == 404
    )


def test_reports_never_include_other_tenants(world, acme):
    from apps.learning.models import Enrollment

    course = Course.objects.create(tenant=acme, title="Theirs")
    Enrollment.objects.create(tenant=acme, course=course, member=world["acme_learner"])
    assert as_("jamil").get("/api/reports/enrollments").json() == []
    assert as_("jamil").get(f"/api/reports/enrollments?courseId={course.pk}").json() == []


def test_deactivated_member_token_stops_working(world):
    token = sign_in("marcus")
    assert (
        as_("jamil")
        .patch(f"/api/members/{world['learner'].pk}/status", {"status": "deactivated"})
        .status_code
        == 200
    )
    assert client_for(token).get("/api/me").status_code in (401, 403)
    assert Asset.objects.count() == 0
