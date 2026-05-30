import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { XAPI_TENANT_EXTENSION } from '@assurance/shared';
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

  const body = req.body as Record<string, unknown> | Record<string, unknown>[];
  const statements = Array.isArray(body) ? body : [body];
  const ids: string[] = [];

  const batch = db.batch();
  for (const raw of statements) {
    const id = (typeof raw['id'] === 'string' && raw['id']) || randomUUID();
    const ctx = (raw['context'] as { extensions?: Record<string, unknown> } | undefined) ?? {};
    batch.set(db.doc(`lrs/${id}`), {
      ...raw,
      id,
      tenantId: payload.t, // authoritative — from the signed token, not the body
      actorUid: payload.u,
      timestamp: (raw['timestamp'] as string) ?? new Date().toISOString(),
      context: {
        ...ctx,
        registration: payload.r,
        extensions: { ...ctx.extensions, [XAPI_TENANT_EXTENSION]: payload.t },
      },
    });
    ids.push(id);
  }
  await batch.commit();

  res.status(200).json(ids);
});
