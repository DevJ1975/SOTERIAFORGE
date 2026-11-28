"""forge.settings reads the environment at import: each case loads it in a fresh process.

Covers the Railway service variables (docs/railway-go-live-plan.md section 5) and pins
the AWS branches the Railway work must not break.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent

# Every variable settings reads that a case might set; cleared so the host shell and
# the test settings cannot leak into a case.
CLEARED = {
    "DJANGO_DEBUG",
    "DJANGO_SECRET_KEY",
    "DJANGO_ALLOWED_HOSTS",
    "DJANGO_SETTINGS_MODULE",
    "RAILWAY_PUBLIC_DOMAIN",
    "RAILWAY_ENVIRONMENT_NAME",
    "DATABASE_URL",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_SSLMODE",
    "DB_APP_USER",
    "DB_APP_PASSWORD",
    "DB_USE_OWNER",
    "FORGE_PUBLIC_URL",
    "FORGE_ROOT_DOMAIN",
    "FORGE_ADMIN_ROOT_DOMAIN",
    "CORS_EXTRA_ORIGINS",
    "CSRF_TRUSTED_ORIGINS",
    "SECURE_HSTS_SECONDS",
    "BADGE_SIGNING_KEY",
    "SENTRY_DSN",
    "REDIS_URL",
}

PROBE = """
import json
from forge import settings as s
db = s.DATABASES["default"]
print(json.dumps({
    "DEBUG": s.DEBUG,
    "SECRET_KEY": s.SECRET_KEY,
    "ALLOWED_HOSTS": s.ALLOWED_HOSTS,
    "DB": {k: db.get(k) for k in ("HOST", "PORT", "NAME", "USER", "PASSWORD")},
    "DB_OPTIONS": db.get("OPTIONS", {}),
    "PUBLIC_URL": s.PUBLIC_URL,
    "MCP_RESOURCE_URL": s.MCP_RESOURCE_URL,
    "CORS_REGEXES": s.CORS_ALLOWED_ORIGIN_REGEXES,
    "CORS_ORIGINS": s.CORS_ALLOWED_ORIGINS,
    "CSRF_TRUSTED_ORIGINS": s.CSRF_TRUSTED_ORIGINS,
    "SECURE_SSL_REDIRECT": s.SECURE_SSL_REDIRECT,
    "SESSION_COOKIE_SECURE": s.SESSION_COOKIE_SECURE,
    "CSRF_COOKIE_SECURE": s.CSRF_COOKIE_SECURE,
    "SECURE_HSTS_SECONDS": s.SECURE_HSTS_SECONDS,
    "BADGE_SIGNING_KEY": s.BADGE_SIGNING_KEY,
    "CACHES": getattr(s, "CACHES", None),
    "CHANNEL_LAYERS": getattr(s, "CHANNEL_LAYERS", None),
}))
"""

PRODUCTION = {"DJANGO_SECRET_KEY": "k", "DATABASE_URL": "postgres://owner:pw@db:5432/forge"}


def run(env: dict[str, str], code: str = PROBE) -> subprocess.CompletedProcess:
    base = {k: v for k, v in os.environ.items() if k not in CLEARED}
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", code],
        cwd=BACKEND,
        env={**base, **env},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def load(env: dict[str, str]) -> dict:
    result = run(env)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def matches(regexes: list[str], origin: str) -> bool:
    return any(re.match(r, origin) for r in regexes)


def test_secret_key_is_required_with_debug_off():
    result = run({"DATABASE_URL": PRODUCTION["DATABASE_URL"]})
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY must be set" in result.stderr


def test_debug_falls_back_to_a_development_key():
    assert load({"DJANGO_DEBUG": "true"})["SECRET_KEY"] == "dev-only-insecure-key"


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
def test_debug_accepts_the_usual_truthy_spellings(value):
    assert load({"DJANGO_DEBUG": value})["DEBUG"] is True


@pytest.mark.parametrize("value", ["0", "false", "no", "", "enabled"])
def test_anything_else_is_debug_off(value):
    assert load({**PRODUCTION, "DJANGO_DEBUG": value})["DEBUG"] is False


def test_allowed_hosts_add_the_railway_domain_and_health_check_host():
    s = load(
        {
            **PRODUCTION,
            "DJANGO_ALLOWED_HOSTS": " api.staging.soteriaforge.com , ,",
            "RAILWAY_PUBLIC_DOMAIN": "api-staging-12cc.up.railway.app",
            "RAILWAY_ENVIRONMENT_NAME": "staging",
        }
    )
    assert s["ALLOWED_HOSTS"] == [
        "api.staging.soteriaforge.com",
        "api-staging-12cc.up.railway.app",
        "healthcheck.railway.app",
    ]


def test_allowed_hosts_stay_as_given_off_railway():
    s = load({**PRODUCTION, "DJANGO_ALLOWED_HOSTS": "api.soteriaforge.com"})
    assert s["ALLOWED_HOSTS"] == ["api.soteriaforge.com"]


@pytest.mark.parametrize(
    "url", ["postgres://u:p@pooler:6543/forge", "postgres://u:p@db:5432/forge?pgbouncer=true"]
)
def test_transaction_mode_poolers_are_refused(url):
    result = run({"DJANGO_SECRET_KEY": "k", "DATABASE_URL": url})
    assert result.returncode != 0
    assert "transaction-mode pooler" in result.stderr


def test_web_process_connects_as_the_runtime_role():
    s = load({**PRODUCTION, "DB_APP_USER": "forge_app", "DB_APP_PASSWORD": "app-pw"})
    assert (s["DB"]["USER"], s["DB"]["PASSWORD"]) == ("forge_app", "app-pw")


def test_migrations_connect_as_the_owner():
    s = load({**PRODUCTION, "DB_APP_PASSWORD": "app-pw", "DB_USE_OWNER": "1"})
    assert (s["DB"]["USER"], s["DB"]["PASSWORD"]) == ("owner", "pw")


def test_without_a_runtime_password_the_owner_is_used():
    assert load(PRODUCTION)["DB"]["USER"] == "owner"


def test_aws_connection_parts_are_used_without_a_database_url():
    s = load(
        {
            "DJANGO_SECRET_KEY": "k",
            "DB_HOST": "rds.internal",
            "DB_PORT": "5433",
            "DB_NAME": "forge",
            "DB_USER": "owner",
            "DB_PASSWORD": "pw",
        }
    )
    assert s["DB"] == {
        "HOST": "rds.internal",
        "PORT": "5433",
        "NAME": "forge",
        "USER": "owner",
        "PASSWORD": "pw",
    }
    assert s["DB_OPTIONS"]["sslmode"] == "require"


def test_database_url_wins_over_aws_parts():
    s = load({**PRODUCTION, "DB_HOST": "rds.internal"})
    assert s["DB"]["HOST"] == "db"


def test_public_url_prefers_the_custom_origin_then_the_railway_domain():
    custom = load(
        {
            **PRODUCTION,
            "FORGE_PUBLIC_URL": "https://api.staging.soteriaforge.com/",
            "RAILWAY_PUBLIC_DOMAIN": "api-staging-12cc.up.railway.app",
        }
    )
    assert custom["PUBLIC_URL"] == "https://api.staging.soteriaforge.com"
    assert custom["MCP_RESOURCE_URL"] == "https://api.staging.soteriaforge.com/mcp"
    railway = load({**PRODUCTION, "RAILWAY_PUBLIC_DOMAIN": "api-staging-12cc.up.railway.app"})
    assert railway["PUBLIC_URL"] == "https://api-staging-12cc.up.railway.app"
    assert load(PRODUCTION)["PUBLIC_URL"] == "http://localhost:8000"


def test_cors_follows_the_staging_root_domain():
    regexes = load({**PRODUCTION, "FORGE_ROOT_DOMAIN": "staging.soteriaforge.com"})["CORS_REGEXES"]
    for allowed in (
        "https://lakewood.staging.soteriaforge.com",
        "https://app.staging.soteriaforge.com",
        "https://lakewood.admin.staging.soteriaforge.com",
    ):
        assert matches(regexes, allowed), allowed
    for refused in (
        "https://lakewood.soteriaforge.com",
        "https://evil-staging.soteriaforge.com.attacker.io",
        "https://a.b.staging.soteriaforge.com",
        "http://lakewood.staging.soteriaforge.com",
    ):
        assert not matches(regexes, refused), refused


def test_admin_root_domain_can_be_overridden():
    regexes = load(
        {
            **PRODUCTION,
            "FORGE_ROOT_DOMAIN": "soteriaforge.com",
            "FORGE_ADMIN_ROOT_DOMAIN": "manage.example.org",
        }
    )["CORS_REGEXES"]
    assert matches(regexes, "https://lakewood.manage.example.org")
    assert not matches(regexes, "https://lakewood.admin.soteriaforge.com")


def test_extra_origins_and_csrf_origins_are_lists():
    s = load(
        {
            **PRODUCTION,
            "CORS_EXTRA_ORIGINS": "https://preview.example.app, https://lms.example.edu",
            "CSRF_TRUSTED_ORIGINS": "https://api.soteriaforge.com",
        }
    )
    assert s["CORS_ORIGINS"] == ["https://preview.example.app", "https://lms.example.edu"]
    assert s["CSRF_TRUSTED_ORIGINS"] == ["https://api.soteriaforge.com"]


def test_https_is_enforced_with_debug_off():
    s = load(PRODUCTION)
    assert s["SECURE_SSL_REDIRECT"] and s["SESSION_COOKIE_SECURE"] and s["CSRF_COOKIE_SECURE"]
    assert s["SECURE_HSTS_SECONDS"] == 3600
    assert load({**PRODUCTION, "SECURE_HSTS_SECONDS": "31536000"})["SECURE_HSTS_SECONDS"] == (
        31536000
    )


def test_badge_key_turns_escaped_newlines_into_real_ones():
    key = load({**PRODUCTION, "BADGE_SIGNING_KEY": "-----BEGIN-----\\nabc\\n-----END-----"})[
        "BADGE_SIGNING_KEY"
    ]
    assert key == "-----BEGIN-----\nabc\n-----END-----"


def test_redis_url_changes_nothing():
    """Nothing reads REDIS_URL, so removing it from Railway cannot change behaviour."""
    without = load(PRODUCTION)
    with_redis = load({**PRODUCTION, "REDIS_URL": "redis://default:pw@redis:6379"})
    assert without == with_redis
    assert without["CHANNEL_LAYERS"] is None


def test_asgi_entry_point_loads():
    """The image starts `uvicorn forge.asgi:application`; gunicorn is gone."""
    result = run(
        {**PRODUCTION, "DJANGO_SETTINGS_MODULE": "forge.settings"},
        "from forge.asgi import application; print(callable(application))",
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip().endswith("True")
