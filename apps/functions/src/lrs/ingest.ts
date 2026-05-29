import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { XAPI_TENANT_EXTENSION, xapiStatement } from '@forge/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';

/**
 * Lightweight Firestore-backed LRS ingest (v1). Appends a tenant-tagged xAPI
 * statement. The caller's tenant claim is authoritative — a client cannot spoof
 * another tenant's scope. (Swap for an external SQL LRS later behind this API.)
 */
export const ingestStatement = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const tenantId = caller.token['tenantId'] as string | undefined;
  if (!tenantId) throw new HttpsError('failed-precondition', 'No tenant scope on caller.');

  const parsed = xapiStatement.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.message);
  }

  const id = parsed.data.id ?? randomUUID();
  const statement = {
    ...parsed.data,
    id,
    tenantId, // server-stamped, authoritative
    actorUid: caller.uid,
    timestamp: parsed.data.timestamp ?? new Date().toISOString(),
    context: {
      ...parsed.data.context,
      extensions: {
        ...parsed.data.context?.extensions,
        [XAPI_TENANT_EXTENSION]: tenantId,
      },
    },
  };

  await db.doc(`lrs/${id}`).set(statement);
  return { ok: true, id };
});
