/**
 * Pure vector + text utilities for the RAG pipeline. No Angular/Firebase deps so
 * they run identically in the client, Cloud Functions, and tests.
 */

/** Cosine similarity of two equal-length vectors. Returns 0 for degenerate input. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Rank candidates by cosine similarity to a query vector and take the top k. */
export function topKBySimilarity<T extends { embedding: readonly number[] }>(
  query: readonly number[],
  candidates: readonly T[],
  k: number,
): Array<T & { score: number }> {
  return candidates
    .map((c) => ({ ...c, score: cosineSimilarity(query, c.embedding) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, Math.max(0, k));
}

/**
 * Split text into chunks of roughly `maxChars`, preferring paragraph then
 * sentence boundaries so chunks stay semantically coherent. Used before
 * embedding source documents.
 */
export function chunkText(text: string, maxChars = 1200): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      flush();
      // Split an oversized paragraph on sentence boundaries.
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((current + ' ' + s).trim().length > maxChars) flush();
        current = (current ? current + ' ' : '') + s;
      }
      flush();
    } else if ((current + '\n\n' + para).length > maxChars) {
      flush();
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  flush();
  return chunks;
}
