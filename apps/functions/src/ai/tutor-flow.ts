import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';

/**
 * Per-tenant RAG tutor (skeleton). The security-critical invariant lives here:
 * retrieval is ALWAYS filtered to the caller's tenant, so no cross-tenant
 * content can ever ground an answer. The embedding + LLM provider are wired in
 * Phase 6 (Genkit + Vertex AI / Anthropic behind a provider interface).
 */
export const askTutor = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const tenantId = caller.token['tenantId'] as string | undefined;
  if (!tenantId) throw new HttpsError('failed-precondition', 'No tenant scope on caller.');

  const question = String((request.data as { question?: unknown })?.question ?? '').trim();
  if (!question) throw new HttpsError('invalid-argument', 'A question is required.');

  // HARD ISOLATION: only this tenant's vectors are ever retrieved.
  // (Phase 6 replaces this with a findNearest vector query / Vertex AI Vector Search.)
  const vectorsRef = db
    .collection(`tenants/${tenantId}/ai/vectors`)
    .where('tenantId', '==', tenantId)
    .limit(5);
  const snap = await vectorsRef.get();
  const citations = snap.docs.map((d) => ({
    sourceId: d.get('sourceId'),
    label: d.get('citation.label') ?? undefined,
    moduleId: d.get('citation.moduleId') ?? undefined,
  }));

  // Placeholder answer until the LLM provider is wired in Phase 6.
  return {
    answer:
      'The AI tutor is not yet connected to a model provider (Phase 6). Retrieval is tenant-isolated.',
    citations,
    tenantId,
  };
});
