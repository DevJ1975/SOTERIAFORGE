import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { ChatMessage } from '@forge/shared';

/** UUID generator compatible with both browser (Web Crypto) and Node/Jest. */
function newUUID(): string {
  // Web Crypto API (browsers, Node ≥ 19 global, Deno)
  if (
    typeof crypto !== 'undefined' &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID === 'function'
  ) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  // Node.js `crypto` module (Jest / server-side)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('crypto') as { randomUUID: () => string }).randomUUID();
}

interface AskTutorRequest {
  question: string;
  tenantId: string;
  uid: string;
}

interface AskTutorResponse {
  answer: string;
  citations: Array<{
    sourceId: string;
    label?: string;
    moduleId?: string;
  }>;
}

/**
 * Internal injection token that holds the Firebase Functions instance.
 * Injecting via this token (rather than directly injecting `Functions`) lets
 * tests provide a plain sentinel without importing `@angular/fire/functions`,
 * which triggers a module-load chain that requires a browser `fetch` global.
 */
export const TUTOR_FUNCTIONS = new InjectionToken<Functions>('TUTOR_FUNCTIONS', {
  providedIn: 'root',
  factory: () => inject(Functions),
});

@Injectable({ providedIn: 'root' })
export class TutorService {
  private readonly functions = inject(TUTOR_FUNCTIONS);

  private readonly _messages = signal<ChatMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /**
   * Invokes the `askTutor` Firebase callable function.
   * Override this method in tests to avoid real Firebase calls.
   */
  protected invoke(question: string, tenantId: string, uid: string): Promise<AskTutorResponse> {
    const callable = httpsCallable<AskTutorRequest, AskTutorResponse>(this.functions, 'askTutor');
    return callable({ question, tenantId, uid }).then((result) => result.data);
  }

  async ask(question: string, ctx: { tenantId: string; uid: string }): Promise<void> {
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
      const response = await this.invoke(question, tenantId, uid);

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
      const message = err instanceof Error ? err.message : 'Unknown error from AI tutor.';
      this._error.set(message);
    } finally {
      this._pending.set(false);
    }
  }
}
