import type { AuditEvent, AuditLogPort } from './audit-log';
import type { AuthPort, CreateUserOptions, DbPort } from './ports';

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

/** In-memory append-only audit sink. `failNext` simulates a write failure. */
export class FakeAuditLogPort implements AuditLogPort {
  readonly events: AuditEvent[] = [];
  failNext = false;

  async append(event: AuditEvent): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated audit write failure');
    }
    this.events.push(event);
  }
}

export function makeFakes(): { auth: FakeAuthPort; db: FakeDbPort; audit: FakeAuditLogPort } {
  return { auth: new FakeAuthPort(), db: new FakeDbPort(), audit: new FakeAuditLogPort() };
}
