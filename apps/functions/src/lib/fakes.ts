import type { AuditEvent, AuditLogPort } from './audit-log';
import type { EnrollmentProjection } from './aggregate-progress.core';
import type { BucketState } from './rate-limit.core';
import type {
  AuthPort,
  CreateMeetingOptions,
  CreateMeetingResult,
  CreateUserOptions,
  DbPort,
  EnrollmentRef,
  RateLimitPort,
  ZoomPort,
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
  /** Enrollment projections keyed by `${tenantId}/${courseId}/${uid}`. */
  readonly enrollments = new Map<string, Partial<EnrollmentProjection>>();
  /** Course docs keyed by `${tenantId}/${courseId}`. */
  readonly courses = new Map<string, Record<string, unknown>>();
  /** Learner-readable live-session docs keyed by `${tenantId}/${id}`. */
  readonly liveSessions = new Map<string, Record<string, unknown>>();
  /** Authoring-only private host subdocs keyed by `${tenantId}/${id}`. */
  readonly liveSessionPrivate = new Map<string, Record<string, unknown>>();

  private memberKey(tenantId: string, uid: string): string {
    return `${tenantId}/${uid}`;
  }

  private enrollmentKey(ref: EnrollmentRef): string {
    return `${ref.tenantId}/${ref.courseId}/${ref.uid}`;
  }

  private pairKey(tenantId: string, id: string): string {
    return `${tenantId}/${id}`;
  }

  /** Test helper: seed a course so scheduleLiveSession's courseId check passes. */
  seedCourse(tenantId: string, courseId: string, data: Record<string, unknown> = {}): void {
    this.courses.set(this.pairKey(tenantId, courseId), { id: courseId, tenantId, ...data });
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

  async getCourse(tenantId: string, courseId: string): Promise<Record<string, unknown> | null> {
    return this.courses.get(this.pairKey(tenantId, courseId)) ?? null;
  }

  async getLiveSession(tenantId: string, id: string): Promise<Record<string, unknown> | null> {
    return this.liveSessions.get(this.pairKey(tenantId, id)) ?? null;
  }

  async setLiveSession(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = this.pairKey(tenantId, id);
    this.liveSessions.set(key, { ...(this.liveSessions.get(key) ?? {}), ...data });
  }

  async setLiveSessionPrivate(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = this.pairKey(tenantId, id);
    this.liveSessionPrivate.set(key, { ...(this.liveSessionPrivate.get(key) ?? {}), ...data });
  }

  async getLiveSessionPrivate(
    tenantId: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    return this.liveSessionPrivate.get(this.pairKey(tenantId, id)) ?? null;
  }

  async deleteLiveSession(tenantId: string, id: string): Promise<void> {
    const key = this.pairKey(tenantId, id);
    this.liveSessions.delete(key);
    this.liveSessionPrivate.delete(key);
  }

  async runEnrollmentTransaction(
    ref: EnrollmentRef,
    apply: (current: Partial<EnrollmentProjection> | null) => Partial<EnrollmentProjection> | null,
  ): Promise<void> {
    const key = this.enrollmentKey(ref);
    const current = this.enrollments.get(key) ?? null;
    const patch = apply(current);
    if (patch === null) return; // guard ignored → no write
    this.enrollments.set(key, { ...(current ?? {}), ...patch });
  }
}

/**
 * Deterministic in-memory Zoom mock. meetingId is `zoom-<n>`; join/start urls and
 * passcode derive from that id so specs can assert exact values. Records calls so
 * tests can assert delete/best-effort behavior.
 */
export class FakeZoomPort implements ZoomPort {
  readonly created: CreateMeetingOptions[] = [];
  readonly deleted: string[] = [];
  /** meetingId -> current status (for getMeeting). */
  readonly statuses = new Map<string, string>();
  /** When set, the next createMeeting rejects (simulate a Zoom API failure). */
  failNextCreate = false;
  private nextId = 1;

  async createMeeting(opts: CreateMeetingOptions): Promise<CreateMeetingResult> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('simulated Zoom create failure');
    }
    this.created.push(opts);
    const meetingId = `zoom-${this.nextId++}`;
    this.statuses.set(meetingId, 'waiting');
    return {
      meetingId,
      joinUrl: `https://zoom.test/j/${meetingId}`,
      startUrl: `https://zoom.test/s/${meetingId}`,
      passcode: `pass-${meetingId}`,
    };
  }

  async getMeeting(meetingId: string): Promise<{ status: string } | null> {
    const status = this.statuses.get(meetingId);
    return status ? { status } : null;
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    this.deleted.push(meetingId);
    this.statuses.delete(meetingId);
  }
}

/** In-memory token-bucket store. `failNext` simulates a transient transport error. */
export class FakeRateLimitPort implements RateLimitPort {
  readonly buckets = new Map<string, BucketState>();
  failNext = false;

  async runBucketTransaction(
    key: string,
    apply: (current: BucketState | null) => BucketState,
  ): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw Object.assign(new Error('simulated transient failure'), { code: 'unavailable' });
    }
    const current = this.buckets.get(key) ?? null;
    // `apply` throws when empty → nothing written (mirrors a transaction abort).
    const next = apply(current);
    this.buckets.set(key, next);
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

export function makeFakes(): {
  auth: FakeAuthPort;
  db: FakeDbPort;
  audit: FakeAuditLogPort;
  zoom: FakeZoomPort;
} {
  return {
    auth: new FakeAuthPort(),
    db: new FakeDbPort(),
    audit: new FakeAuditLogPort(),
    zoom: new FakeZoomPort(),
  };
}
