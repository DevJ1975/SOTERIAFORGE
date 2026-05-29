import { topKBySimilarity } from '@forge/shared';
import { db } from '../lib/admin';
import type { RetrievedChunk } from './providers';

/**
 * Retrieve the top-k most relevant chunks for a query embedding — scoped to a
 * SINGLE tenant's vector collection. This is the hard tenant-isolation boundary
 * of the AI tutor: only `tenants/{tenantId}/vectors` is ever read, so no other
 * tenant's content can ground an answer. The caller's tenant is validated
 * upstream (auth claim) before this is called.
 *
 * Uses in-memory cosine ranking (works everywhere, incl. the emulator). At scale
 * this is swapped for Firestore `findNearest` KNN over the same tenant-scoped
 * collection — the isolation guarantee is identical.
 */
export async function retrieveTopK(
  tenantId: string,
  queryEmbedding: number[],
  k = 5,
): Promise<RetrievedChunk[]> {
  const snap = await db
    .collection(`tenants/${tenantId}/vectors`)
    .where('tenantId', '==', tenantId)
    .get();

  const candidates = snap.docs.map((d) => ({
    text: (d.get('text') as string) ?? '',
    citation: {
      sourceId: d.get('sourceId') as string | undefined,
      moduleId: (d.get('citation') as { moduleId?: string } | undefined)?.moduleId,
      label: (d.get('citation') as { label?: string } | undefined)?.label,
    },
    embedding: (d.get('embedding') as number[]) ?? [],
  }));

  return topKBySimilarity(queryEmbedding, candidates, k).map((c) => ({
    text: c.text,
    citation: c.citation,
    score: c.score,
  }));
}
