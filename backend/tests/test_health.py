"""/healthz as Railway's deploy check and the AWS load balancer see it."""

import pytest
from django.db.utils import OperationalError
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_answers_railway_health_check_host(settings):
    settings.ALLOWED_HOSTS = ["api.soteriaforge.com", "healthcheck.railway.app"]
    res = APIClient().get("/healthz", headers={"host": "healthcheck.railway.app"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_plain_http_probe_is_not_redirected_but_other_paths_are(settings):
    settings.SECURE_SSL_REDIRECT = True
    settings.ALLOWED_HOSTS = ["testserver"]
    client = APIClient()
    assert client.get("/healthz").status_code == 200
    assert client.get("/api/me").status_code == 301


def test_sets_no_cookie_and_needs_no_token():
    res = APIClient().get("/healthz")
    assert res.status_code == 200
    assert not res.cookies


def test_fails_when_the_database_does_not_answer(monkeypatch):
    from apps.accounts import views

    class Broken:
        def cursor(self):
            raise OperationalError("database is down")

    monkeypatch.setattr(views, "connection", Broken())
    client = APIClient(raise_request_exception=False)
    assert client.get("/healthz").status_code >= 500


def test_content_service_answers_health_and_nothing_from_the_api(settings):
    settings.ROOT_URLCONF = "apps.standards.content_urls"
    client = APIClient()
    assert client.get("/healthz").status_code == 200
    for path in ("/api/me", "/admin/", "/oauth/authorize/", "/mcp"):
        assert client.get(path).status_code == 404, path
