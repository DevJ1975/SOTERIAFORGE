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

export interface CorePorts {
  auth: AuthPort;
  db: DbPort;
  /**
   * Append-only audit sink. Optional so existing tests/cores that don't care
   * about auditing keep working; privileged cores write to it best-effort.
   */
  audit?: AuditLogPort;
}
