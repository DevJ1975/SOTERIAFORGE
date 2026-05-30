import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';
import { getProviders } from './providers';
import { retrieveTopK } from './retrieval';

/**
 * Per-tenant RAG tutor. Hard isolation invariant: retrieval is scoped to the
 * caller's tenant only (validated from the auth claim), so no cross-tenant
 * content can ever ground an answer. Answers cite the tenant's own sources.
 */
export const askTutor = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const tenantId = caller.token['tenantId'] as string | undefined;
  if (!tenantId) throw new HttpsError('failed-precondition', 'No tenant scope on caller.');

  const question = String((request.data as { question?: unknown })?.question ?? '').trim();
  if (!question) throw new HttpsError('invalid-argument', 'A question is required.');

  const { embedding, llm } = await getProviders();

  // Embed the question and retrieve tenant-isolated context.
  const queryEmbedding = await embedding.embed(question);
  const context = await retrieveTopK(tenantId, queryEmbedding, 5);

  // Ground the answer; cite the tenant's own sources.
  const answer = await llm.answer(question, context);
  const citations = context.map((c) => ({
    sourceId: c.citation.sourceId,
    moduleId: c.citation.moduleId,
    label: c.citation.label,
  }));

  // Persist the conversation turn (learner reads only their own thread).
  const uid = caller.uid;
  const now = new Date().toISOString();
  const base = `tenants/${tenantId}/conversations/${uid}/messages`;
  await db.doc(`${base}/${randomUUID()}`).set({
    tenantId,
    uid,
    role: 'user',
    content: question,
    createdAt: now,
  });
  await db.doc(`${base}/${randomUUID()}`).set({
    tenantId,
    uid,
    role: 'assistant',
    content: answer,
    citations,
    createdAt: new Date().toISOString(),
  });

  return { answer, citations, tenantId };
});
