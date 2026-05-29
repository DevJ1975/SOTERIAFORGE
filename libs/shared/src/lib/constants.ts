/**
 * Platform-wide constants for Soteria FORGE.
 * Keep these aligned with Firestore security rules and Cloud Functions claim-setters.
 */

/** Roles encoded as Firebase custom claims. */
export const ROLES = [
  'superadmin',
  'tenant_admin',
  'instructor',
  'learner',
  'b2c_customer',
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may author content. */
export const AUTHORING_ROLES: readonly Role[] = ['superadmin', 'tenant_admin', 'instructor'];

/** Roles scoped to a single tenant (carry a tenantId claim). */
export const TENANT_SCOPED_ROLES: readonly Role[] = [
  'tenant_admin',
  'instructor',
  'learner',
  'b2c_customer',
];

/** Module content delivery types. */
export const CONTENT_TYPES = ['video', 'scorm', 'cmi5', 'quiz', 'game', 'unity'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Game engines supported by the interactive layer. */
export const GAME_ENGINES = ['phaser', 'pixi', 'rive'] as const;
export type GameEngine = (typeof GAME_ENGINES)[number];

/** Tenant lifecycle states. */
export const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'archived'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Member lifecycle states. */
export const MEMBER_STATUSES = ['invited', 'active', 'deactivated'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Course/content publication lifecycle. */
export const PUBLISH_STATUSES = ['draft', 'published', 'archived'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/** Leaderboard windows. */
export const LEADERBOARD_PERIODS = ['daily', 'weekly', 'allTime'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Quiz question types. */
export const QUESTION_TYPES = [
  'mcq',
  'multi_select',
  'true_false',
  'ordering',
  'matching',
  'fill_in',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The dedicated public B2C tenant id. */
export const B2C_TENANT_ID = 'b2c';

/** Reserved subdomains that never resolve to a tenant. */
export const RESERVED_SUBDOMAINS = ['www', 'app', 'admin', 'api', 'static', 'assets'] as const;

/** xAPI verbs emitted by the platform (ADL + custom). */
export const XAPI_VERBS = {
  launched: 'http://adlnet.gov/expapi/verbs/launched',
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  progressed: 'http://adlnet.gov/expapi/verbs/progressed',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
} as const;

/** Custom xAPI context extension key carrying tenant scope on every statement. */
export const XAPI_TENANT_EXTENSION = 'https://soteriaforge.com/xapi/extensions/tenantId';
