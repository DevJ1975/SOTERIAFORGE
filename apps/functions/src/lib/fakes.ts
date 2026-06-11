import type {
  AuthPort,
  CreateUserOptions,
  DbPort,
  GamificationDbPort,
  StatementDbPort,
} from './ports';

/**
 * In-memory fakes for the ports. Used by the colocated jest specs — no emulator,
 * no firebase-admin. Not imported by production code.
 */

export interface FakeUser {
  uid: string;
  email: string;
  displayName?: string;
}

export class FakeAuthPort implements AuthPort {
  readonly users = new Map<string, FakeUser>();
  /** uid -> last claims written (null = cleared). */
  readonly claims = new Map<string, Record<string, unknown> | null>();
  readonly setClaimsCalls: Array<{ uid: string; claims: Record<string, unknown> | null }> = [];
  readonly createdUids: string[] = [];
  /** What createGcipTenant resolves to (null simulates Identity Platform unavailable). */
  gcipResult: { tenantId: string } | null = null;
  private nextUid = 1;

  addUser(user: FakeUser): void {
    this.users.set(user.uid, user);
  }

  async setCustomClaims(uid: string, claims: Record<string, unknown> | null): Promise<void> {
    this.claims.set(uid, claims);
    this.setClaimsCalls.push({ uid, claims });
  }

  async getUserByEmail(email: string): Promise<{ uid: string } | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return { uid: user.uid };
    }
    return null;
  }

  async createUser(opts: CreateUserOptions): Promise<{ uid: string }> {
    const uid = `fake-uid-${this.nextUid++}`;
    this.users.set(uid, { uid, email: opts.email, displayName: opts.displayName });
    this.createdUids.push(uid);
    return { uid };
  }

  async createGcipTenant(): Promise<{ tenantId: string } | null> {
    return this.gcipResult;
  }
}

export class FakeDbPort implements DbPort {
  readonly tenants = new Map<string, Record<string, unknown>>();
  readonly members = new Map<string, Record<string, unknown>>();

  private memberKey(tenantId: string, uid: string): string {
    return `${tenantId}/${uid}`;
  }

  async getTenant(tenantId: string): Promise<Record<string, unknown> | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async setTenant(tenantId: string, data: Record<string, unknown>): Promise<void> {
    this.tenants.set(tenantId, { ...(this.tenants.get(tenantId) ?? {}), ...data });
  }

  async getMember(tenantId: string, uid: string): Promise<Record<string, unknown> | null> {
    return this.members.get(this.memberKey(tenantId, uid)) ?? null;
  }

  async setMember(tenantId: string, uid: string, data: Record<string, unknown>): Promise<void> {
    const key = this.memberKey(tenantId, uid);
    this.members.set(key, { ...(this.members.get(key) ?? {}), ...data });
  }
}

export class FakeGamificationDbPort implements GamificationDbPort {
  /** `${tenantId}/${uid}` -> member doc. */
  readonly members = new Map<string, Record<string, unknown>>();
  /** `${tenantId}/${uid}/${eventId}` -> XP ledger doc. */
  readonly xpEvents = new Map<string, Record<string, unknown>>();
  /** `${tenantId}/${uid}/${badgeId}` -> award doc. */
  readonly awards = new Map<string, Record<string, unknown>>();
  /** `${tenantId}/${resultId}` -> merged game-result fields. */
  readonly gameResults = new Map<string, Record<string, unknown>>();
  readonly addXpEventCalls: Array<{ tenantId: string; uid: string; eventId: string }> = [];
  readonly setAwardCalls: Array<{ tenantId: string; uid: string; badgeId: string }> = [];
  readonly updateGameResultCalls: Array<{ tenantId: string; resultId: string }> = [];

  private memberKey(tenantId: string, uid: string): string {
    return `${tenantId}/${uid}`;
  }

  async getMember(tenantId: string, uid: string): Promise<Record<string, unknown> | null> {
    return this.members.get(this.memberKey(tenantId, uid)) ?? null;
  }

  async setMember(tenantId: string, uid: string, data: Record<string, unknown>): Promise<void> {
    const key = this.memberKey(tenantId, uid);
    this.members.set(key, { ...(this.members.get(key) ?? {}), ...data });
  }

  async getXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.xpEvents.get(`${tenantId}/${uid}/${eventId}`) ?? null;
  }

  async addXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
    doc: Record<string, unknown>,
  ): Promise<void> {
    this.xpEvents.set(`${tenantId}/${uid}/${eventId}`, doc);
    this.addXpEventCalls.push({ tenantId, uid, eventId });
  }

  async getAward(
    tenantId: string,
    uid: string,
    badgeId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.awards.get(`${tenantId}/${uid}/${badgeId}`) ?? null;
  }

  async setAward(
    tenantId: string,
    uid: string,
    badgeId: string,
    doc: Record<string, unknown>,
  ): Promise<void> {
    this.awards.set(`${tenantId}/${uid}/${badgeId}`, doc);
    this.setAwardCalls.push({ tenantId, uid, badgeId });
  }

  async updateGameResult(
    tenantId: string,
    resultId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = `${tenantId}/${resultId}`;
    this.gameResults.set(key, { ...(this.gameResults.get(key) ?? {}), ...data });
    this.updateGameResultCalls.push({ tenantId, resultId });
  }
}

export class FakeStatementDbPort implements StatementDbPort {
  /** `${tenantId}/${statementId}` -> stored doc. */
  readonly statements = new Map<string, Record<string, unknown>>();
  readonly saveCalls: Array<{ tenantId: string; statementId: string }> = [];

  async saveStatement(
    tenantId: string,
    statementId: string,
    doc: Record<string, unknown>,
  ): Promise<void> {
    this.statements.set(`${tenantId}/${statementId}`, doc);
    this.saveCalls.push({ tenantId, statementId });
  }
}

export function makeFakes(): { auth: FakeAuthPort; db: FakeDbPort } {
  return { auth: new FakeAuthPort(), db: new FakeDbPort() };
}
