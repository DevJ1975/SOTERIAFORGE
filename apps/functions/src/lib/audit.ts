import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';

/**
 * Append-only audit log of privileged/admin actions. Written server-side only
 * (no client write surface in firestore.rules). Supports compliance and
 * incident review. Scoped per tenant where applicable; platform-level actions
 * go under `platform/audit`.
 */
export interface AuditEntry {
  action: string;
  actorUid: string;
  tenantId?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const path = entry.tenantId ? `tenants/${entry.tenantId}/audit` : 'platform/auditLog';
  await db.collection(path).add({
    ...entry,
    at: new Date().toISOString(),
    seq: FieldValue.serverTimestamp(),
  });
}
