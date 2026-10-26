"""Test settings: the real settings with safe defaults for env vars tests don't set."""

import os

os.environ.setdefault("DJANGO_DEBUG", "false")
os.environ.setdefault("DJANGO_SECRET_KEY", "test-secret")
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "testserver")

from .settings import *  # noqa: E402, F403

# No collected static files in tests.
MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m]  # noqa: F405
SECURE_SSL_REDIRECT = False
