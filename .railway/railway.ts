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
      branch: ctx.isEnvironment('production') ? 'main' : null,
    }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile', watchPatterns: ['backend/**'] },
    preDeploy: 'python manage.py migrate --noinput',
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      DJANGO_DEBUG: 'false',
      DJANGO_ALLOWED_HOSTS: 'api.soteriaforge.com',
      FORGE_ROOT_DOMAIN: 'soteriaforge.com',
      DJANGO_SECRET_KEY: preserve(),
      FIREBASE_PROJECT_ID: preserve(),
      FIREBASE_CREDENTIALS_JSON: preserve(),
      SENTRY_DSN: preserve(),
    },
  });

  return project('soteria-forge', { resources: [db, cache, api] });
});
