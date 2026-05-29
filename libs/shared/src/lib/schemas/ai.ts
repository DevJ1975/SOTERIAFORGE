import { z } from 'zod';
import { auditable, docId, isoDateTime, tenantId, uid } from './primitives';

/** /tenants/{tenantId}/ai/knowledgeBase/{docId} — a grounding source. */
export const knowledgeSource = auditable.extend({
  id: docId,
  tenantId,
  title: z.string().min(1).max(300),
  /** Where the source came from. */
  kind: z.enum(['course', 'module', 'upload', 'url']),
  sourceRef: z.string().optional(),
  /** Ingestion lifecycle for the embedding pipeline. */
  status: z.enum(['pending', 'chunking', 'embedding', 'ready', 'failed']).default('pending'),
  chunkCount: z.number().int().nonnegative().default(0),
  error: z.string().optional(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSource>;

/**
 * A vector chunk. Stored either in Firestore (native vector search) or an
 * external index keyed by tenantId. Retrieval is ALWAYS filtered by tenantId.
 */
export const vectorChunk = z.object({
  id: docId,
  tenantId,
  sourceId: docId,
  text: z.string(),
  /** Embedding vector; length depends on the configured model. */
  embedding: z.array(z.number()),
  /** Citation metadata back to the originating module/course. */
  citation: z.object({
    courseId: docId.optional(),
    moduleId: docId.optional(),
    label: z.string().optional(),
  }),
});
export type VectorChunk = z.infer<typeof vectorChunk>;

export const chatRole = z.enum(['user', 'assistant', 'system']);

/** /tenants/{tenantId}/ai/conversations/{uid}/messages/{msgId} */
export const chatMessage = z.object({
  id: docId,
  tenantId,
  uid,
  role: chatRole,
  content: z.string(),
  /** Source citations attached to assistant answers. */
  citations: z
    .array(
      z.object({
        sourceId: docId,
        label: z.string().optional(),
        moduleId: docId.optional(),
      }),
    )
    .default([]),
  createdAt: isoDateTime,
});
export type ChatMessage = z.infer<typeof chatMessage>;
