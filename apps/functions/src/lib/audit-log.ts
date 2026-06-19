import { z } from 'zod';

/**
 * Structured, append-only audit logging (SOC 2 CC7 / Confidentiality).
 *
 * Audit events capture *who did what to whom*: the actor's uid + role, the
 * tenant scope, the privileged action, the target, and a server timestamp.
 * They are written to an append-only collection whose Firestore rules are
 * `write: if false` (Cloud Functions / Admin SDK only) and read-restricted to
 * superadmin (plus tenant_admin for their own tenant when tenant-scoped).
 *
 * Writes are deliberately *best-effort and non-fatal*: an audit failure must
 * never roll back or fail the privileged operation it records. Failures are
 * logged to stderr for operational visibility.
 */

/** Privileged actions worth recording. Open enum: any string is accepted. */
export const AUDIT_ACTIONS = ['setUserRole', 'inviteMember', 'provisionTenant'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {});

/** The validated shape persisted to Firestore. */
export const auditEvent = z.object({
  /** Actor (caller) uid; 'unknown' when the token carried no uid. */
  actorUid: z.string().min(1),
  /** Actor role from verified custom claims, when present. */
  actorRole: z.string().min(1).optional(),
  /** Tenant the action is scoped to, when applicable. */
  tenantId: z.string().min(1).optional(),
  /** The privileged action performed. */
  action: z.string().min(1),
  /** The entity acted upon (e.g. target uid or tenant id), when applicable. */
  target: z.string().min(1).optional(),
  /** Free-form, non-sensitive structured context. */
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Server-side ISO-8601 timestamp (set by the writer, never the caller). */
  timestamp: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof auditEvent>;

/** The caller-supplied fields; timestamp + actor identity are derived. */
export interface AuditInput {
  actorUid?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  action: AuditAction;
  target?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Minimal append-only sink. The adapter persists to `/auditLogs/{id}`; tests
 * supply an in-memory fake. Implementations MUST only ever append.
 */
export interface AuditLogPort {
  append(event: AuditEvent): Promise<void>;
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  // Firestore rejects `undefined` field values; drop them.
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Build a validated AuditEvent from caller input. Stamps the server timestamp
 * and normalizes a missing actor uid to 'unknown'. Returns `null` (rather than
 * throwing) when the resulting event is malformed, so callers can stay
 * best-effort.
 */
export function buildAuditEvent(input: AuditInput, now: Date = new Date()): AuditEvent | null {
  const candidate = clean({
    actorUid: input.actorUid && input.actorUid.length > 0 ? input.actorUid : 'unknown',
    actorRole: input.actorRole ?? undefined,
    tenantId: input.tenantId ?? undefined,
    action: input.action,
    target: input.target ?? undefined,
    metadata: input.metadata,
    timestamp: now.toISOString(),
  });
  const parsed = auditEvent.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Record a privileged action. Best-effort: never throws — a failed or invalid
 * audit write returns `false` instead of propagating, so the surrounding
 * privileged operation is never affected.
 */
export async function recordAuditEvent(
  port: AuditLogPort | undefined,
  input: AuditInput,
  now: Date = new Date(),
): Promise<boolean> {
  if (!port) return false;
  const event = buildAuditEvent(input, now);
  if (!event) {
    console.error('Skipping malformed audit event', { action: input.action });
    return false;
  }
  try {
    await port.append(event);
    return true;
  } catch (err) {
    // Non-fatal: log and carry on.
    console.error('Best-effort audit log write failed', err);
    return false;
  }
}
