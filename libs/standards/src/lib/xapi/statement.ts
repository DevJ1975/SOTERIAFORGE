import { XAPI_TENANT_EXTENSION, XAPI_VERBS } from '@forge/shared';

/**
 * Minimal xAPI 1.0.3 statement model + builder for the Soteria FORGE LRS
 * pipeline. Framework-free: no Angular, no Firebase — usable from apps,
 * libraries and Cloud Functions alike.
 *
 * Only the slice of the spec the platform emits is modelled (account-based
 * actors, Activity objects, score/success/completion results, tenant-scoped
 * context extensions). See https://github.com/adlnet/xAPI-Spec (1.0.3).
 */

/** The IRL all Forge actor accounts are homed on. */
export const XAPI_ACTOR_HOME_PAGE = 'https://soteriaforge.com';

/** Namespace prefix for every activity id the platform emits. */
export const XAPI_ACTIVITY_BASE = 'https://soteriaforge.com/xapi/activities';

/** Activity kinds the platform reports on. */
export type XapiActivityKind = 'course' | 'lesson' | 'quiz' | 'game';

/** ADL activity-type IRIs per kind (object.definition.type). */
export const XAPI_ACTIVITY_TYPES: Readonly<Record<XapiActivityKind, string>> = {
  course: 'http://adlnet.gov/expapi/activities/course',
  lesson: 'http://adlnet.gov/expapi/activities/lesson',
  quiz: 'http://adlnet.gov/expapi/activities/assessment',
  game: 'http://adlnet.gov/expapi/activities/simulation',
};

/** xAPI 1.0.3 §4.1.2.1 — account-based agent identification. */
export interface XapiAccount {
  homePage: string;
  name: string;
}

/** xAPI 1.0.3 §4.1.2 — the platform always identifies actors by account (uid). */
export interface XapiActor {
  objectType: 'Agent';
  /** Human-readable display name; never used for identification. */
  name?: string;
  account: XapiAccount;
}

/** xAPI 1.0.3 §4.1.3. */
export interface XapiVerb {
  id: string;
  display: Record<string, string>;
}

/** xAPI 1.0.3 §4.1.4.1 — activity definition (display metadata only here). */
export interface XapiActivityDefinition {
  name?: Record<string, string>;
  type?: string;
}

/** xAPI 1.0.3 §4.1.4 — Activity object. */
export interface XapiActivity {
  objectType: 'Activity';
  id: string;
  definition?: XapiActivityDefinition;
}

/** xAPI 1.0.3 §4.1.5.1. */
export interface XapiScore {
  scaled?: number;
  raw?: number;
  min?: number;
  max?: number;
}

/** xAPI 1.0.3 §4.1.5. */
export interface XapiResult {
  score?: XapiScore;
  success?: boolean;
  completion?: boolean;
  /** ISO 8601 duration, e.g. 'PT5M30S'. */
  duration?: string;
}

/** xAPI 1.0.3 §4.1.6 — context; extensions always carry the tenant id. */
export interface XapiContext {
  registration?: string;
  contextActivities?: {
    parent?: XapiActivity[];
  };
  extensions: Record<string, unknown>;
}

/** xAPI 1.0.3 §4.1 — a complete statement as persisted in the LRS store. */
export interface Statement {
  id: string;
  actor: XapiActor;
  verb: XapiVerb;
  object: XapiActivity;
  result?: XapiResult;
  context: XapiContext;
  timestamp: string;
  version: '1.0.3';
}

/**
 * RFC 4122 v4 uuid: prefers the platform implementation, with a Math.random
 * fallback for runtimes without Web Crypto (good enough for statement ids).
 */
export function statementUuid(): string {
  const cryptoImpl = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoImpl?.randomUUID) {
    return cryptoImpl.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Canonical, tenant-namespaced activity id:
 * `https://soteriaforge.com/xapi/activities/{kind}/{tenantId}/{ref}`.
 * `ref` may contain '/' separators (e.g. 'courseId/lessonId'); each segment is
 * URI-encoded so the result is always a valid IRI.
 */
export function activityIdFor(kind: XapiActivityKind, tenantId: string, ref: string): string {
  const encodedRef = ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${XAPI_ACTIVITY_BASE}/${kind}/${encodeURIComponent(tenantId)}/${encodedRef}`;
}

/** Inputs for {@link buildStatement}. */
export interface BuildStatementOptions {
  /** Firebase Auth uid — becomes actor.account.name. */
  actorUid: string;
  /** Optional display name (never used for identification). */
  actorName?: string;
  /** One of the platform verbs (see @forge/shared XAPI_VERBS). */
  verb: keyof typeof XAPI_VERBS;
  /** Full activity IRI — use {@link activityIdFor}. */
  activityId: string;
  activityName?: string;
  /** Activity-type IRI (see {@link XAPI_ACTIVITY_TYPES}). */
  activityType?: string;
  /** Tenant scope — written into context.extensions[XAPI_TENANT_EXTENSION]. */
  tenantId: string;
  /** xAPI registration (an attempt/enrollment correlation uuid). */
  registration?: string;
  result?: XapiResult;
  /** Parent activity IRI (e.g. the course a lesson belongs to). */
  parentActivityId?: string;
}

/**
 * Builds a valid, tenant-scoped xAPI 1.0.3 statement. Every statement gets a
 * fresh uuid, an ISO timestamp and the tenant context extension — there is no
 * way to produce an un-scoped statement through this builder.
 */
export function buildStatement(opts: BuildStatementOptions): Statement {
  const verbId = XAPI_VERBS[opts.verb];
  return {
    id: statementUuid(),
    actor: {
      objectType: 'Agent',
      ...(opts.actorName ? { name: opts.actorName } : {}),
      account: { homePage: XAPI_ACTOR_HOME_PAGE, name: opts.actorUid },
    },
    verb: { id: verbId, display: { 'en-US': opts.verb } },
    object: {
      objectType: 'Activity',
      id: opts.activityId,
      ...(opts.activityName || opts.activityType
        ? {
            definition: {
              ...(opts.activityName ? { name: { 'en-US': opts.activityName } } : {}),
              ...(opts.activityType ? { type: opts.activityType } : {}),
            },
          }
        : {}),
    },
    ...(opts.result ? { result: opts.result } : {}),
    context: {
      ...(opts.registration ? { registration: opts.registration } : {}),
      ...(opts.parentActivityId
        ? {
            contextActivities: {
              parent: [{ objectType: 'Activity', id: opts.parentActivityId }],
            },
          }
        : {}),
      extensions: { [XAPI_TENANT_EXTENSION]: opts.tenantId },
    },
    timestamp: new Date().toISOString(),
    version: '1.0.3',
  };
}
