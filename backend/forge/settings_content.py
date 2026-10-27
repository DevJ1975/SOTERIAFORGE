"""Separate content-only Railway service; never mount package routes on the API."""

from .settings import *  # noqa: F403

ROOT_URLCONF = "apps.standards.content_urls"
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.tenants.rls.RlsMiddleware",
]
SESSION_COOKIE_PATH = "/no-sessions"
CSRF_COOKIE_PATH = "/no-sessions"
