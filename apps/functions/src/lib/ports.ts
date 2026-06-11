/**
 * Minimal, Promise-based ports the cores depend on. Real implementations live in
 * adapters.ts (firebase-admin); tests use in-memory fakes (fakes.ts).
 */

export interface CreateUserOptions {
  email: string;
  displayName?: string;
}

export interface AuthPort {
  /** Replace a user's custom claims; `null` clears them entirely. */
  setCustomClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
  /** Resolve an existing user by email, or `null` when none exists. */
  getUserByEmail(email: string): Promise<{ uid: string } | null>;
  /** Create a new auth user. */
  createUser(opts: CreateUserOptions): Promise<{ uid: string }>;
  /**
   * Create a GCIP (Identity Platform) tenant. Optional: adapters return `null`
   * when Identity Platform is unavailable on the project.
   */
  createGcipTenant?(displayName: string): Promise<{ tenantId: string } | null>;
}

export interface DbPort {
  getTenant(tenantId: string): Promise<Record<string, unknown> | null>;
  setTenant(tenantId: string, data: Record<string, unknown>): Promise<void>;
  getMember(tenantId: string, uid: string): Promise<Record<string, unknown> | null>;
  /** Upsert (merge) a member document. */
  setMember(tenantId: string, uid: string, data: Record<string, unknown>): Promise<void>;
}

export interface StatementDbPort {
  /** Persist one xAPI statement at /tenants/{tenantId}/xapiStatements/{id}. */
  saveStatement(tenantId: string, statementId: string, doc: Record<string, unknown>): Promise<void>;
}

/**
 * Persistence the gamification cores need. Member reads/writes are shared with
 * DbPort; the rest covers the XP ledger, badge awards and game-result stamps.
 */
export interface GamificationDbPort extends Pick<DbPort, 'getMember' | 'setMember'> {
  /** Read one XP ledger entry, or `null` when it does not exist. */
  getXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
  ): Promise<Record<string, unknown> | null>;
  /** Persist one XP ledger entry at /tenants/{t}/members/{uid}/xpEvents/{eventId}. */
  addXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
    doc: Record<string, unknown>,
  ): Promise<void>;
  /** Read one badge award, or `null` when the badge was never earned. */
  getAward(tenantId: string, uid: string, badgeId: string): Promise<Record<string, unknown> | null>;
  /** Persist one badge award at /tenants/{t}/members/{uid}/awards/{badgeId}. */
  setAward(
    tenantId: string,
    uid: string,
    badgeId: string,
    doc: Record<string, unknown>,
  ): Promise<void>;
  /** Merge fields onto /tenants/{t}/gameResults/{resultId} (e.g. the xpAwarded stamp). */
  updateGameResult(
    tenantId: string,
    resultId: string,
    data: Record<string, unknown>,
  ): Promise<void>;
}

export interface CorePorts {
  auth: AuthPort;
  db: DbPort;
}
