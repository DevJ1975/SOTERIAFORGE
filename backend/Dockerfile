# Soteria Forge API and isolated content service. Built by Railway from backend/.
FROM node:24-alpine AS scorm-runtime
WORKDIR /runtime
COPY runtime/package.json runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
COPY --from=scorm-runtime /runtime/node_modules/scorm-again/dist/scorm-again.min.js /app/runtime/node_modules/scorm-again/dist/scorm-again.min.js
RUN DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput

RUN useradd --create-home --uid 10001 forge && chown -R forge /app
USER forge

# Railway injects PORT. Proxy headers let Django see the original https scheme.
CMD ["sh", "-c", "exec uvicorn forge.asgi:application --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips='*'"]
