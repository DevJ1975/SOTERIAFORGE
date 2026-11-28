import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def preflight(origin: str):
    return APIClient().options(
        "/api/me",
        HTTP_ORIGIN=origin,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,x-forge-tenant",
    )


def test_tenant_subdomains_may_call_the_api_with_token_and_tenant_headers():
    res = preflight("https://lakewood.soteriaforge.com")
    assert res["Access-Control-Allow-Origin"] == "https://lakewood.soteriaforge.com"
    allowed = res["Access-Control-Allow-Headers"].lower()
    assert "authorization" in allowed
    assert "x-forge-tenant" in allowed


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "https://soteriaforge.com.evil.example",
        "http://lakewood.soteriaforge.com",
        "https://a.b.soteriaforge.com",
        "https://lakewood.admin.soteriaforge.com.evil.example",
        "https://evil-admin.soteriaforge.com.attacker.io",
    ],
)
def test_other_origins_are_not_allowed(origin):
    assert "Access-Control-Allow-Origin" not in preflight(origin)


@pytest.mark.parametrize(
    "origin",
    [
        "https://app.soteriaforge.com",  # superadmin
        "https://lakewood.admin.soteriaforge.com",  # tenant admin (plan D2)
        "https://soteriaforge.com",  # storefront
    ],
)
def test_platform_app_origins_are_allowed(origin):
    assert preflight(origin)["Access-Control-Allow-Origin"] == origin


def test_cmi5_units_may_send_the_xapi_version_header():
    res = APIClient().options(
        "/api/me",
        HTTP_ORIGIN="https://lakewood.soteriaforge.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-experience-api-version",
    )
    assert "x-experience-api-version" in res["Access-Control-Allow-Headers"].lower()
