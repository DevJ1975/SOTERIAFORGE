"""Soteria Forge API settings. Everything environment-specific comes from env vars
(Railway service variables in deployed environments, `.env` locally)."""

import os
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


DEBUG = env_bool("DJANGO_DEBUG")
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off")
    SECRET_KEY = "dev-only-insecure-key"  # noqa: S105

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# Railway sets RAILWAY_PUBLIC_DOMAIN on services with a public domain.
if os.environ.get("RAILWAY_PUBLIC_DOMAIN"):
    ALLOWED_HOSTS.append(os.environ["RAILWAY_PUBLIC_DOMAIN"])
# Railway's deploy health check sends this Host header; without it /healthz is a 400.
if os.environ.get("RAILWAY_ENVIRONMENT_NAME"):
    ALLOWED_HOSTS.append("healthcheck.railway.app")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "apps.tenants",
    "apps.accounts",
    "apps.audit",
    "apps.engage",
    "apps.learning",
    "apps.assessments",
    "apps.coach",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # After auth so Django admin staff can be recognized; see apps/tenants/rls.py.
    "apps.tenants.rls.RlsMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "forge.urls"
WSGI_APPLICATION = "forge.wsgi.application"
ASGI_APPLICATION = "forge.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        default="postgres://forge:forge@localhost:5433/forge",
        conn_max_age=60,
        conn_health_checks=True,
    )
}
# The web process connects as the RLS-bound runtime role (apps/tenants/dbroles.py);
# migrations and `ensure_app_role` run with DB_USE_OWNER=1 as the owner.
if os.environ.get("DB_APP_PASSWORD") and not env_bool("DB_USE_OWNER"):
    DATABASES["default"]["USER"] = os.environ.get("DB_APP_USER", "forge_app")
    DATABASES["default"]["PASSWORD"] = os.environ["DB_APP_PASSWORD"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# --- API ---------------------------------------------------------------------
REST_FRAMEWORK = {
    # Firebase ID tokens only: no session/basic auth on the API.
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.FirebaseAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.accounts.permissions.IsActiveMember"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
}
SPECTACULAR_SETTINGS = {
    "TITLE": "Soteria Forge API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Several models have a `status` field; name each choice set explicitly.
    "ENUM_NAME_OVERRIDES": {
        "TenantStatusEnum": "apps.tenants.models.Tenant.Status",
        "MemberStatusEnum": "apps.accounts.models.Member.Status",
        "PublishStatusEnum": "apps.learning.models.PublishStatus",
        "CoachAgentEnum": "apps.coach.profiles.Agent.choices",
    },
}

# Angular apps on Vercel: tenant subdomains + the apex storefront.
ROOT_DOMAIN = os.environ.get("FORGE_ROOT_DOMAIN", "soteriaforge.com")
CORS_ALLOWED_ORIGIN_REGEXES = [rf"^https://([a-z0-9-]+\.)?{ROOT_DOMAIN.replace('.', r'\.')}$"]
CORS_ALLOWED_ORIGINS = env_list("CORS_EXTRA_ORIGINS")
# Firebase ID token + the host-resolved tenant (apps/accounts/authentication.py).
CORS_ALLOW_HEADERS = (*default_headers, "x-forge-tenant")
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES.append(r"^http://([a-z0-9-]+\.)?localhost(:\d+)?$")

# --- Firebase (identity only) ------------------------------------------------
# Service-account JSON (inline). Absent locally/in tests: token verification uses
# Application Default Credentials or is mocked.
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
FIREBASE_CREDENTIALS_JSON = os.environ.get("FIREBASE_CREDENTIALS_JSON", "")

# Browser-facing WebSocket URL and server-side HTTP API URL may differ in containers.
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")
LIVEKIT_API_URL = os.environ.get("LIVEKIT_API_URL", LIVEKIT_URL)
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

# Local AI pilot: intentionally loopback-only; Railway cannot reach a Mac's localhost.
COACH_ENABLED = env_bool("COACH_ENABLED")
COACH_MODEL = "qwen3:8b"
COACH_MODEL_DIGEST = "500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41"
COACH_EMBED_MODEL = "qwen3-embedding:0.6b"
COACH_EMBED_DIGEST = "ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d"

# --- Security ----------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
# Railway's health check probes over plain HTTP inside its network.
SECURE_REDIRECT_EXEMPT = [r"^healthz$"]
# Start short; raise to 31536000 once every API host is confirmed HTTPS-only.
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "0" if DEBUG else "3600"))
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}

if os.environ.get("SENTRY_DSN"):
    import sentry_sdk

    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        environment=os.environ.get("RAILWAY_ENVIRONMENT_NAME", "local"),
        send_default_pii=False,  # FERPA: no learner PII in error reports
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0")),
    )
