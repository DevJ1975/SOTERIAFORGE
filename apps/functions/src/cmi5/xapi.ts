import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { XAPI_TENANT_EXTENSION, xapiStatement } from '@assurance/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';
import { verifyToken } from './token';

const CMI5_SECRET = defineSecret('CMI5_SIGNING_SECRET');

/**
 * Minimal xAPI LRS statements endpoint for external AUs (Unity / cmi5). The AU
 * authenticates with the cmi5 auth-token (Bearer) obtained from the fetch flow.
 * The token is the authority for tenant scope — statements are stamped with the
 * token's tenant, so an AU can never write into another tenant. This is the
 * external-content equivalent of the `ingestStatement` callable.
 */
export const xapi = onRequest({ secrets: [CMI5_SECRET], cors: true }, async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.status(405).send('Method not allowed');
    return;
  }

  const auth = req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyToken(token, CMI5_SECRET.value()) : null;
  if (!payload || payload.k !== 'auth') {
    res.status(401).send('Unauthorized');
    return;
  }

  const body = req.body as unknown;
  const rawStatements = Array.isArray(body) ? body : [body];
  // Bound the batch: reject oversized submissions (Firestore batches cap at 500;
  // we cap lower to limit storage-cost / DoS abuse from a single auth token).
  if (rawStatements.length === 0 || rawStatements.length > 100) {
    res.status(400).send('Between 1 and 100 statements per request');
    return;
  }

  const ids: string[] = [];
  const batch = db.batch();
  for (const raw of rawStatements) {
    // Validate against the xAPI schema; never persist arbitrary client fields.
    const parsed = xapiStatement.safeParse(raw);
    if (!parsed.success) {
      res.status(400).send('Invalid xAPI statement');
      return;
    }
    const stmt = parsed.data;
    const id = stmt.id ?? randomUUID();
    const ctx = stmt.context ?? {};
    batch.set(db.doc(`lrs/${id}`), {
      ...stmt,
      id,
      tenantId: payload.t, // authoritative — from the signed token, not the body
      actorUid: payload.u,
      timestamp: stmt.timestamp ?? new Date().toISOString(),
      context: {
        ...ctx,
        registration: payload.r,
        extensions: { ...(ctx.extensions ?? {}), [XAPI_TENANT_EXTENSION]: payload.t },
      },
    });
    ids.push(id);
  }
  await batch.commit();

  res.status(200).json(ids);
});
