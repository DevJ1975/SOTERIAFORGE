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
  database,
  defineRailway,
  github,
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
  // Railway's "Wait for CI": a commit deploys only after its GitHub checks pass.
  const checkSuites = true;
  // Staging lives under trainovate.ai (DNS on Vercel) until soteriaforge.com's DNS
  // moves off JustHost; production stays on soteriaforge.com.
  const root = production ? 'soteriaforge.com' : 'forge.trainovate.ai';
  const apiOrigin = `https://api.${root}`;

  // US East (Virginia) for every environment: tenants are in the US (plan D5).
  const REGION = 'iad';
  const regions = { [REGION]: 1 };
  // Railway's SSL Postgres image, which bundles pgvector. Pinned to 17 to match CI,
  // compose and AWS RDS (plan D6). Never change the major on a live database: the
  // data directory does not upgrade in place.
  const db = database('postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:17',
    defaultMountPath: '/var/lib/postgresql/data',
    region: REGION,
  });
  const media = bucket('media', { region: REGION });

  // Shared by every service built from backend/Dockerfile.
  const backendSource = github(REPO, { rootDirectory: 'backend', branch, checkSuites });
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
  // The content origin and the SCORM cron run the same code against the same database,
  // so they take the API's secrets by reference instead of holding copies.
  const fromApi = {
    ...runtimeDb,
    DB_APP_PASSWORD: '${{api.DB_APP_PASSWORD}}',
    DJANGO_SECRET_KEY: '${{api.DJANGO_SECRET_KEY}}',
  };
  // References to the `media` bucket's own variables: nobody copies the keys, and they
  // follow a credential reset.
  const storage = {
    STANDARDS_S3_ENDPOINT: '${{media.ENDPOINT}}',
    STANDARDS_S3_BUCKET: '${{media.BUCKET}}',
    STANDARDS_S3_REGION: '${{media.REGION}}',
    STANDARDS_S3_ACCESS_KEY: '${{media.ACCESS_KEY_ID}}',
    STANDARDS_S3_SECRET_KEY: '${{media.SECRET_ACCESS_KEY}}',
    // Off until the content service passes its checks (plan S18).
    STANDARDS_ENABLED: preserve(),
  };

  const api = service('api', {
    regions,
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
      // Set to the API's custom origin once its DNS and certificate work (plan 8.4);
      // until then the OAuth issuer follows the Railway domain.
      FORGE_PUBLIC_URL: preserve(),
      CSRF_TRUSTED_ORIGINS: apiOrigin,
      STANDARDS_CONTENT_ORIGIN: preserve(),
      STANDARDS_APP_ORIGINS: preserve(),
      SENTRY_DSN: preserve(),
      // smtp once a provider is chosen (plan D14); until then emails go to the log.
      EMAIL_BACKEND: preserve(),
      EMAIL_HOST: preserve(),
      EMAIL_PORT: preserve(),
      EMAIL_HOST_USER: preserve(),
      EMAIL_HOST_PASSWORD: preserve(),
      EMAIL_USE_TLS: preserve(),
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
    regions,
    source: backendSource,
    build: backendBuild,
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    env: {
      ...fromApi,
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
    regions,
    source: backendSource,
    build: backendBuild,
    startCommand: 'python manage.py process_scorm',
    deploy: { cronSchedule: '*/5 * * * *', restartPolicyType: 'NEVER' },
    env: { ...fromApi, ...storage, SENTRY_DSN: preserve() },
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
      regions,
      source: github(REPO, { branch, checkSuites }),
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
        regions,
        source: github(REPO, { branch, checkSuites }),
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
