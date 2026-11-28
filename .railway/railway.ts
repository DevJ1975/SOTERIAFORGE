/**
 * Soteria Forge on Railway (Infrastructure as Code; railway.toml is deprecated).
 *   railway config plan    # preview against the linked environment
 *   railway config apply   # apply
 * Runbook: docs/railway-go-live-plan.md. Read the whole plan before every apply and
 * never apply one that deletes or replaces `postgres` or a volume.
 *
 * Secrets are never stored here: `preserve()` keeps the value set in Railway. Set
 * every preserved variable in the dashboard before the first apply in an environment.
 * Custom domains, DNS and the region are set by hand (plan sections 8 and 11).
 */
import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  type ProjectResourceInput,
} from 'railway/iac';

const REPO = 'DevJ1975/SOTERIAFORGE';

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment('production');
  // Production deploys from main once the release pull request merges (plan D3).
  const branch = production ? 'main' : 'feat/angular-22-upgrade';
  const root = production ? 'soteriaforge.com' : 'staging.soteriaforge.com';
  const apiOrigin = `https://api.${root}`;

  const db = postgres('postgres');
  const media = bucket('media');

  // Shared by every service built from backend/Dockerfile.
  const backendSource = github(REPO, { rootDirectory: 'backend', branch, checkSuites: true });
  const backendBuild = {
    builder: 'DOCKERFILE' as const,
    dockerfilePath: 'Dockerfile',
    watchPatterns: ['backend/**'],
  };
  const runtimeDb = {
    DATABASE_URL: db.env.DATABASE_URL,
    DB_APP_USER: 'forge_app',
    DB_APP_PASSWORD: preserve(),
    DJANGO_SECRET_KEY: preserve(),
    DJANGO_DEBUG: 'false',
  };
  // Railway Bucket credentials, copied from the bucket's variables in the dashboard.
  const storage = {
    STANDARDS_S3_ENDPOINT: preserve(),
    STANDARDS_S3_BUCKET: preserve(),
    STANDARDS_S3_REGION: 'auto',
    STANDARDS_S3_ACCESS_KEY: preserve(),
    STANDARDS_S3_SECRET_KEY: preserve(),
    // Off until the content service passes its checks (plan S18).
    STANDARDS_ENABLED: preserve(),
  };

  const api = service('api', {
    source: backendSource,
    build: backendBuild,
    // Migrate as the database owner, then refresh the RLS-bound runtime role the
    // web process connects as (Postgres superusers skip row-level security).
    preDeploy:
      "sh -c 'DB_USE_OWNER=1 python manage.py migrate --noinput && DB_USE_OWNER=1 python manage.py ensure_app_role'",
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      ...runtimeDb,
      ...storage,
      PORT: '8000',
      DJANGO_ALLOWED_HOSTS: `api.${root}`,
      FORGE_ROOT_DOMAIN: root,
      FORGE_PUBLIC_URL: apiOrigin,
      CSRF_TRUSTED_ORIGINS: apiOrigin,
      STANDARDS_CONTENT_ORIGIN: preserve(),
      STANDARDS_APP_ORIGINS: preserve(),
      SENTRY_DSN: preserve(),
      EMAIL_BACKEND: 'django.core.mail.backends.smtp.EmailBackend',
      EMAIL_HOST: preserve(),
      EMAIL_PORT: preserve(),
      EMAIL_HOST_USER: preserve(),
      EMAIL_HOST_PASSWORD: preserve(),
      EMAIL_USE_TLS: 'true',
      DEFAULT_FROM_EMAIL: preserve(),
      // Open Badges signing key (docs/open-badges.md): `manage.py generate_badge_key`.
      BADGE_SIGNING_KEY: preserve(),
      // Separate VPS media host. Import deploy/livekit/runtime/railway.env into
      // this API service before applying; never store the key/secret in IaC.
      LIVEKIT_URL: preserve(),
      LIVEKIT_API_URL: preserve(),
      LIVEKIT_API_KEY: preserve(),
      LIVEKIT_API_SECRET: preserve(),
      // Ask Forge only talks to a local Ollama model; off on Railway (plan D13).
      COACH_ENABLED: 'false',
    },
  });

  // SCORM content origin: same image, content-only settings, its own domain (plan D9).
  const content = service('content', {
    source: backendSource,
    build: backendBuild,
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      ...runtimeDb,
      ...storage,
      PORT: '8000',
      DJANGO_SETTINGS_MODULE: 'forge.settings_content',
      DJANGO_ALLOWED_HOSTS: preserve(),
      STANDARDS_CONTENT_ORIGIN: preserve(),
      STANDARDS_APP_ORIGINS: preserve(),
      SENTRY_DSN: preserve(),
    },
  });

  // Imports uploaded SCORM packages. Railway cron must exit; five minutes is the floor.
  const scormWorker = service('scorm-worker', {
    source: backendSource,
    build: backendBuild,
    startCommand: 'python manage.py process_scorm',
    deploy: { cronSchedule: '*/5 * * * *', restartPolicyType: 'NEVER' },
    env: { ...runtimeDb, ...storage, SENTRY_DSN: preserve() },
  });

  // Learner, admin and superadmin: root Dockerfile, last stage (nginx). Public values only.
  const frontendWatch = [
    'apps/**',
    'libs/**',
    'package.json',
    'package-lock.json',
    'Dockerfile',
    'docker/**',
    'scripts/**',
  ];
  const frontend = (app: string, rootDomain: string) =>
    service(app, {
      source: github(REPO, { branch, checkSuites: true }),
      build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile', watchPatterns: frontendWatch },
      healthcheck: '/',
      deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
      env: {
        PORT: '80',
        APP: app,
        CONFIGURATION: 'production',
        FORGE_API_BASE_URL: apiOrigin,
        FORGE_ROOT_DOMAIN: rootDomain,
      },
    });

  const learner = frontend('learner', root); // <tenant>.<root>
  const admin = frontend('admin', `admin.${root}`); // <tenant>.admin.<root> (plan D2)
  const superadmin = frontend('superadmin', root); // app.<root>

  const resources: ProjectResourceInput[] = [
    db,
    media,
    api,
    content,
    scormWorker,
    learner,
    admin,
    superadmin,
  ];

  if (production) {
    // Public storefront on the apex and www.
    resources.push(
      service('storefront', {
        source: github(REPO, { branch, checkSuites: true }),
        build: {
          builder: 'DOCKERFILE',
          dockerfilePath: 'docker/storefront.Dockerfile',
          watchPatterns: frontendWatch,
        },
        healthcheck: '/',
        deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
        env: {
          PORT: '4000',
          FORGE_ROOT_DOMAIN: root,
          NG_ALLOWED_HOSTS: `${root},www.${root}`,
        },
      }),
    );
  }

  return project('soteria-forge', { resources });
});
