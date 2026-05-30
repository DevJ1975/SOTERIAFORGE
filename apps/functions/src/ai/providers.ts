/**
 * Pluggable AI providers. The RAG orchestration depends only on these
 * interfaces, so the embedding model and LLM are swappable (Vertex AI Gemini,
 * Anthropic Claude, …) per the build spec.
 *
 * A deterministic local provider is the default so the full pipeline (chunk →
 * embed → retrieve → ground → answer) runs and is testable without live cloud
 * credentials. Configure a real provider by setting the relevant secrets and
 * implementing the adapter (see `createVertexProviders`, documented below).
 */

export const EMBED_DIM = 768;

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface RetrievedChunk {
  text: string;
  citation: { sourceId?: string; moduleId?: string; label?: string };
  score: number;
}

export interface LlmProvider {
  /** Generate a grounded answer from the question + retrieved context. */
  answer(question: string, context: RetrievedChunk[], persona?: string): Promise<string>;
}

/**
 * Deterministic local embedding: hashed bag-of-words into a fixed-dim vector.
 * Captures lexical overlap (enough for working, testable retrieval) without a
 * network call. Replace with a real embedding model in production.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array(EMBED_DIM).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const tok of tokens) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      vec[Math.abs(h) % EMBED_DIM] += 1;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / mag);
  }
}

/**
 * Local extractive "LLM": returns a grounded answer composed from the most
 * relevant retrieved chunks, with explicit citations. Guardrailed to refuse
 * when there is no tenant context to ground on (no hallucination).
 */
export class LocalLlmProvider implements LlmProvider {
  async answer(question: string, context: RetrievedChunk[]): Promise<string> {
    if (context.length === 0) {
      return "I couldn't find anything in this tenant's training content to answer that. Try rephrasing, or ask your administrator to add the relevant material.";
    }
    const grounded = context
      .slice(0, 3)
      .map((c, i) => `[${i + 1}] ${c.text.trim().slice(0, 400)}`)
      .join('\n\n');
    return (
      `Based on your organization's training content:\n\n${grounded}\n\n` +
      `(Answer grounded in ${context.length} source passage(s); see citations.)`
    );
  }
}

export interface AiProviders {
  embedding: EmbeddingProvider;
  llm: LlmProvider;
}

/**
 * Provider factory. Returns the real Vertex AI adapter when
 * `FORGE_AI_PROVIDER=vertex` (requires a GCP project + Vertex AI enabled),
 * otherwise the local deterministic providers. The Vertex module is imported
 * lazily so Genkit isn't loaded by functions that don't use AI. The RAG
 * orchestration is identical regardless of provider.
 */
export async function getProviders(): Promise<AiProviders> {
  if (process.env['FORGE_AI_PROVIDER'] === 'vertex') {
    const { VertexEmbeddingProvider, VertexLlmProvider } = await import('./vertex-providers');
    return { embedding: new VertexEmbeddingProvider(), llm: new VertexLlmProvider() };
  }
  return { embedding: new LocalEmbeddingProvider(), llm: new LocalLlmProvider() };
}
