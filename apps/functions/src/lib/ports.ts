/**
 * Minimal, Promise-based ports the cores depend on. Real implementations live in
 * adapters.ts (firebase-admin); tests use in-memory fakes (fakes.ts).
 */

import type { AuditLogPort } from './audit-log';
import type { BucketState } from './rate-limit.core';
import type { EnrollmentProjection } from './aggregate-progress.core';

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

/** Identifies a single enrollment doc within the events tree. */
export interface EnrollmentRef {
  tenantId: string;
  courseId: string;
  uid: string;
}

export interface DbPort {
  getTenant(tenantId: string): Promise<Record<string, unknown> | null>;
  setTenant(tenantId: string, data: Record<string, unknown>): Promise<void>;
  getMember(tenantId: string, uid: string): Promise<Record<string, unknown> | null>;
  /** Upsert (merge) a member document. */
  setMember(tenantId: string, uid: string, data: Record<string, unknown>): Promise<void>;
  /** Read a course doc at `tenants/{t}/courses/{courseId}`, or `null` when absent. */
  getCourse(tenantId: string, courseId: string): Promise<Record<string, unknown> | null>;
  /** Read the learner-readable live-session doc, or `null` when absent. */
  getLiveSession(tenantId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Upsert (merge) the learner-readable live-session doc. */
  setLiveSession(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  /**
   * Upsert (merge) the authoring-only private subdoc holding the sensitive host
   * `startUrl` at `tenants/{t}/liveSessions/{id}/private/host`.
   */
  setLiveSessionPrivate(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  /** Read the private host subdoc, or `null` when absent. */
  getLiveSessionPrivate(tenantId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Delete the live-session doc (and is best-effort on its private subdoc). */
  deleteLiveSession(tenantId: string, id: string): Promise<void>;
  /**
   * Read-modify-write the enrollment projection under a single transaction.
   * `apply` receives the current projection (`null` if the enrollment doc does
   * not exist yet) and returns the merge patch to persist, or `null` to skip the
   * write entirely (e.g. when the monotonic guard ignores an event). Used by the
   * progress-aggregation trigger to stay authoritative under concurrent events.
   */
  runEnrollmentTransaction(
    ref: EnrollmentRef,
    apply: (current: Partial<EnrollmentProjection> | null) => Partial<EnrollmentProjection> | null,
  ): Promise<void>;
}

/**
 * Token-bucket rate limiter backing store at `/rateLimits/{key}`. The core
 * (`rate-limit.core.ts`) supplies the refill + take logic; the port only owns
 * the transactional read-modify-write of one bucket.
 */
export interface RateLimitPort {
  /**
   * Atomically read bucket `key`'s state (`null` when fresh), pass it to
   * `apply`, and persist the returned next state. If `apply` throws (bucket
   * empty), the transaction aborts and nothing is written.
   */
  runBucketTransaction(
    key: string,
    apply: (current: BucketState | null) => BucketState,
  ): Promise<void>;
}

/** Options for creating a Zoom meeting/webinar. */
export interface CreateMeetingOptions {
  type: 'meeting' | 'webinar';
  topic: string;
  /** ISO-8601 scheduled start time. */
  startTime: string;
  durationMin: number;
  tenantId: string;
  hostUid: string;
}

/** What Zoom returns after creating a meeting/webinar. */
export interface CreateMeetingResult {
  meetingId: string;
  /** Learner-facing join link. */
  joinUrl: string;
  /** Sensitive host start link (kept off the learner-readable doc). */
  startUrl: string;
  passcode?: string;
}

/**
 * Zoom integration port. The real adapter (adapters.ts) talks to the Zoom REST
 * API via Server-to-Server OAuth; tests use the deterministic FakeZoomPort.
 */
export interface ZoomPort {
  createMeeting(opts: CreateMeetingOptions): Promise<CreateMeetingResult>;
  /** Fetch a meeting's status, or `null` when it no longer exists. */
  getMeeting(meetingId: string): Promise<{ status: string } | null>;
  deleteMeeting(meetingId: string): Promise<void>;
}

export interface CorePorts {
  auth: AuthPort;
  db: DbPort;
  /**
   * Append-only audit sink. Optional so existing tests/cores that don't care
   * about auditing keep working; privileged cores write to it best-effort.
   */
  audit?: AuditLogPort;
  /**
   * Zoom integration. Optional/null when Zoom is not configured (no `ZOOM_*`
   * secrets) — `scheduleLiveSession` throws `unavailable` in that case.
   */
  zoom?: ZoomPort;
}
