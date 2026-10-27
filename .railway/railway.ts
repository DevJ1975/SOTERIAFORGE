/**
 * Soteria Forge on Railway (Infrastructure as Code; railway.toml is deprecated).
 *   railway config plan    # preview against the linked environment
 *   railway config apply   # apply
 * Secrets are never stored here: `preserve()` keeps the value set in Railway.
 * See docs/forge-platform-plan.md §2 for the architecture.
 */
import { defineRailway, github, postgres, preserve, project, redis, service } from 'railway/iac';

export default defineRailway((ctx) => {
  const db = postgres('postgres');
  const cache = redis('redis');

  const api = service('api', {
    source: github('DevJ1975/SOTERIAFORGE', {
      rootDirectory: 'backend',
      // Staging tracks the Angular 22 + Django branch until it merges to main.
      branch: ctx.isEnvironment('production') ? 'main' : 'feat/angular-22-upgrade',
    }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile', watchPatterns: ['backend/**'] },
    // Migrate as the database owner, then refresh the RLS-bound runtime role the
    // web process connects as (Postgres superusers skip row-level security).
    preDeploy:
      "sh -c 'DB_USE_OWNER=1 python manage.py migrate --noinput && DB_USE_OWNER=1 python manage.py ensure_app_role'",
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      DJANGO_DEBUG: 'false',
      DJANGO_ALLOWED_HOSTS: 'api.soteriaforge.com',
      FORGE_ROOT_DOMAIN: 'soteriaforge.com',
      DB_APP_USER: 'forge_app',
      DB_APP_PASSWORD: preserve(),
      DJANGO_SECRET_KEY: preserve(),
      FIREBASE_PROJECT_ID: preserve(),
      FIREBASE_CREDENTIALS_JSON: preserve(),
      SENTRY_DSN: preserve(),
      // Separate VPS media host. Import deploy/livekit/runtime/railway.env into
      // this API service before applying; never store the key/secret in IaC.
      LIVEKIT_URL: preserve(),
      LIVEKIT_API_URL: preserve(),
      LIVEKIT_API_KEY: preserve(),
      LIVEKIT_API_SECRET: preserve(),
    },
  });

  return project('soteria-forge', { resources: [db, cache, api] });
});
