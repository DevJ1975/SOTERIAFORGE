"""Vercel entrypoint: serves the Django WSGI application (see vercel.json)."""

import sys
from pathlib import Path

# The function's working directory is the project root, but be explicit so `forge`
# and `apps` import the same way they do under manage.py.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forge.wsgi import application as app  # noqa: E402

__all__ = ["app"]
