import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { chunkText } from '@forge/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';
import { getProviders } from './providers';

const MAX_TEXT = 500_000;

/**
 * Ingest a knowledge source into a tenant's vector index: chunk → embed → write
 * vectors to `tenants/{tenantId}/vectors`, each stamped with `tenantId` (hard
 * isolation). Superadmin or a tenant_admin within their own tenant only.
 *
 * `text` is the extracted source content (the admin console extracts text from
 * uploads/links before calling this; binary extraction is a deployment-time
 * convenience function).
 */
export const ingestKnowledge = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const data = request.data as {
    tenantId?: string;
    sourceId?: string;
    text?: string;
    label?: string;
    moduleId?: string;
  };
  const tenantId = String(data.tenantId ?? '');
  const sourceId = String(data.sourceId ?? '');
  const text = String(data.text ?? '');

  const isSuper = caller.token['role'] === 'superadmin';
  const isOwnTenantAdmin =
    caller.token['role'] === 'tenant_admin' && caller.token['tenantId'] === tenantId;
  if (!isSuper && !isOwnTenantAdmin) {
    throw new HttpsError('permission-denied', 'Not allowed to ingest for this tenant.');
  }
  if (!tenantId || !sourceId) {
    throw new HttpsError('invalid-argument', 'tenantId and sourceId are required.');
  }
  if (text.length > MAX_TEXT) {
    throw new HttpsError('invalid-argument', 'Source text too large.');
  }

  const sourceRef = db.doc(`tenants/${tenantId}/knowledgeBase/${sourceId}`);
  await sourceRef.set(
    { status: 'embedding', updatedAt: new Date().toISOString() },
    { merge: true },
  );

  try {
    const { embedding } = getProviders();
    const chunks = chunkText(text);

    // Replace any prior vectors for this source (idempotent re-ingest).
    const prior = await db
      .collection(`tenants/${tenantId}/vectors`)
      .where('sourceId', '==', sourceId)
      .get();
    const delBatch = db.batch();
    prior.docs.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();

    let written = 0;
    // Firestore batches cap at 500 ops.
    for (let i = 0; i < chunks.length; i += 100) {
      const batch = db.batch();
      const slice = chunks.slice(i, i + 100);
      const vectors = await Promise.all(slice.map((c) => embedding.embed(c)));
      slice.forEach((chunk, j) => {
        const id = randomUUID();
        batch.set(db.doc(`tenants/${tenantId}/vectors/${id}`), {
          id,
          tenantId,
          sourceId,
          text: chunk,
          embedding: vectors[j],
          citation: { label: data.label, moduleId: data.moduleId },
        });
      });
      await batch.commit();
      written += slice.length;
    }

    await sourceRef.set(
      { status: 'ready', chunkCount: written, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return { ok: true, chunks: written };
  } catch (err) {
    await sourceRef.set(
      { status: 'failed', error: (err as Error).message, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    throw new HttpsError('internal', 'Ingestion failed.');
  }
});
