import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { ChatMessage } from '@assurance/shared';
import { CoachApi, coachError, type CoachAgentId, type TutorAnswer } from './coach-api';

/** UUID generator compatible with both browser (Web Crypto) and Node ≥ 19+/Jest. */
function newUUID(): string {
  // Web Crypto API — available in all modern browsers, Node ≥ 19 globals, and
  // Jest environments that polyfill crypto.randomUUID (see test-setup.ts).
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: RFC-4122 v4 UUID built from Math.random (test/SSR only).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

@Injectable()
export class TutorService {
  private readonly api = inject(CoachApi);
  private generation = 0;
  private request: AbortController | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  private readonly _messages = signal<ChatMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  reset(): void {
    this.generation++;
    this.request?.abort();
    this.request = undefined;
    this._messages.set([]);
    this._pending.set(false);
    this._error.set(null);
  }

  protected invoke(question: string, courseId: string, agent: CoachAgentId): Promise<TutorAnswer> {
    return this.api.ask(question, courseId, this.request?.signal, agent);
  }

  async ask(
    question: string,
    ctx: { tenantId: string; uid: string; courseId: string; agent?: CoachAgentId },
  ): Promise<void> {
    if (this._pending()) return;
    const generation = this.generation;
    this.request = new AbortController();
    const { tenantId, uid } = ctx;
    const now = new Date().toISOString();

    const userMessage: ChatMessage = {
      id: newUUID(),
      tenantId,
      uid,
      role: 'user',
      content: question,
      citations: [],
      createdAt: now,
    };

    this._messages.update((msgs) => [...msgs, userMessage]);
    this._pending.set(true);
    this._error.set(null);

    try {
      const response = await this.invoke(question, ctx.courseId, ctx.agent ?? 'general');
      if (generation !== this.generation) return;

      const assistantMessage: ChatMessage = {
        id: newUUID(),
        tenantId,
        uid,
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        createdAt: new Date().toISOString(),
      };

      this._messages.update((msgs) => [...msgs, assistantMessage]);
    } catch (err) {
      if (generation === this.generation) this._error.set(coachError(err));
    } finally {
      if (generation === this.generation) {
        this._pending.set(false);
        this.request = undefined;
      }
    }
  }
}
