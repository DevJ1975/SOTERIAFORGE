import { type Genkit, genkit } from 'genkit';
import { gemini15Pro, textEmbedding004, vertexAI } from '@genkit-ai/vertexai';
import type { EmbeddingProvider, LlmProvider, RetrievedChunk } from './providers';

/**
 * Production AI providers backed by Vertex AI (Gemini + text-embedding-004) via
 * Genkit. Implements the same EmbeddingProvider/LlmProvider interfaces as the
 * local defaults, so the RAG orchestration is unchanged. Selected by
 * `getProviders()` when `ASSURANCE_AI_PROVIDER=vertex` (requires a GCP project +
 * Vertex AI enabled). Loaded lazily so Genkit isn't pulled into functions that
 * don't use AI.
 */
let aiInstance: Genkit | undefined;
function ai(): Genkit {
  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [vertexAI({ location: process.env['VERTEX_LOCATION'] ?? 'us-central1' })],
    });
  }
  return aiInstance;
}

export class VertexEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const res = await ai().embed({ embedder: textEmbedding004, content: text });
    return res[0]?.embedding ?? [];
  }
}

export class VertexLlmProvider implements LlmProvider {
  async answer(question: string, context: RetrievedChunk[], persona?: string): Promise<string> {
    if (context.length === 0) {
      return "I couldn't find anything in this tenant's training content to answer that.";
    }
    const grounding = context.map((c, i) => `[${i + 1}] ${c.text.trim()}`).join('\n\n');
    const prompt =
      `${persona ?? 'You are a helpful training assistant for this organization.'}\n` +
      `Answer the question using ONLY the context below. Cite sources as [n]. ` +
      `If the answer is not in the context, say you don't know.\n\n` +
      `Context:\n${grounding}\n\nQuestion: ${question}`;
    const res = await ai().generate({ model: gemini15Pro, prompt });
    return res.text;
  }
}
