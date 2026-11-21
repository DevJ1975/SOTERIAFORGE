import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { ChatMessage } from '@assurance/shared';
import {
  CoachApi,
  coachError,
  type AskInput,
  type AskStreamHandlers,
  type CoachAgentId,
  type CoachDiagram,
  type CoachRating,
  type CoachStage,
  type TutorAnswer,
} from './coach-api';

/** A chat message plus what the coach attaches to an answer. */
export type TutorMessage = ChatMessage & {
  /** Present on a logged answer; rating needs it. */
  exchangeId?: string | null;
  diagram?: CoachDiagram | null;
  followUps?: string[];
  abstained?: boolean;
  /** Still being written: the text is unvalidated and may be replaced. */
  streaming?: boolean;
  rating?: CoachRating;
};

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

  private readonly _messages = signal<TutorMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /** What the coach is doing while an answer is pending. */
  private readonly _stage = signal<CoachStage | null>(null);
  readonly stage = this._stage.asReadonly();

  /**
   * Text for a polite live region: set when an answer starts and when it is complete,
   * never per streamed token.
   */
  private readonly _announcement = signal('');
  readonly announcement = this._announcement.asReadonly();

  reset(): void {
    this.generation++;
    this.request?.abort();
    this.request = undefined;
    this._messages.set([]);
    this._pending.set(false);
    this._error.set(null);
    this._stage.set(null);
    this._announcement.set('');
  }

  protected invoke(input: AskInput, handlers: AskStreamHandlers): Promise<TutorAnswer> {
    return this.api.askStream(input, handlers);
  }

  async ask(
    question: string,
    ctx: {
      tenantId: string;
      uid: string;
      courseId: string;
      agent?: CoachAgentId;
      moduleId?: string;
    },
  ): Promise<void> {
    if (this._pending()) return;
    const generation = this.generation;
    this.request = new AbortController();
    const { tenantId, uid } = ctx;
    const now = new Date().toISOString();
    const current = () => generation === this.generation;

    const userMessage: TutorMessage = {
      id: newUUID(),
      tenantId,
      uid,
      role: 'user',
      content: question,
      citations: [],
      createdAt: now,
    };
    const answerId = newUUID();
    const patch = (change: (message: TutorMessage) => TutorMessage) =>
      this._messages.update((msgs) => msgs.map((m) => (m.id === answerId ? change(m) : m)));

    // Follow-up suggestions belong to the latest answer only.
    this._messages.update((msgs) => [
      ...msgs.map((m) => (m.followUps?.length ? { ...m, followUps: [] } : m)),
      userMessage,
    ]);
    this._pending.set(true);
    this._error.set(null);
    this._stage.set('retrieving');
    this._announcement.set('The tutor is working on an answer.');

    let started = false;
    try {
      const response = await this.invoke(
        {
          question,
          courseId: ctx.courseId,
          agent: ctx.agent ?? 'general',
          ...(ctx.moduleId ? { moduleId: ctx.moduleId } : {}),
        },
        {
          signal: this.request.signal,
          onStatus: (stage) => {
            if (current()) this._stage.set(stage);
          },
          onDelta: (text) => {
            if (!current()) return;
            if (!started) {
              started = true;
              this._messages.update((msgs) => [
                ...msgs,
                {
                  id: answerId,
                  tenantId,
                  uid,
                  role: 'assistant',
                  content: text,
                  citations: [],
                  createdAt: new Date().toISOString(),
                  streaming: true,
                },
              ]);
            } else {
              patch((m) => ({ ...m, content: m.content + text }));
            }
          },
        },
      );
      if (!current()) return;

      const assistantMessage: TutorMessage = {
        id: answerId,
        tenantId,
        uid,
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        createdAt: new Date().toISOString(),
        exchangeId: response.exchangeId ?? null,
        diagram: response.diagram ?? null,
        followUps: response.followUps ?? [],
        abstained: response.abstained,
        rating: null,
      };
      if (started) patch(() => assistantMessage);
      else this._messages.update((msgs) => [...msgs, assistantMessage]);
      this._announcement.set(`Tutor: ${response.answer}`);
    } catch (err) {
      if (current()) {
        // Streamed text was never validated, so it goes when the answer fails.
        this._messages.update((msgs) => msgs.filter((m) => m.id !== answerId));
        this._error.set(coachError(err));
        this._announcement.set('');
      }
    } finally {
      if (current()) {
        this._pending.set(false);
        this._stage.set(null);
        this.request = undefined;
      }
    }
  }

  /**
   * Thumbs up or down on an answer; the same value again clears it. Shown at once and
   * put back if the server refuses.
   */
  async rate(messageId: string, rating: Exclude<CoachRating, null>, note?: string): Promise<void> {
    const message = this._messages().find((m) => m.id === messageId);
    if (!message?.exchangeId) return;
    const generation = this.generation;
    const previous = message.rating ?? null;
    // A note is an addition to an existing thumbs down, not a toggle.
    const next: CoachRating = previous === rating && note === undefined ? null : rating;
    const set = (value: CoachRating) =>
      this._messages.update((msgs) =>
        msgs.map((m) => (m.id === messageId ? { ...m, rating: value } : m)),
      );
    set(next);
    this._error.set(null);
    try {
      await this.api.rate(message.exchangeId, next, next === 'down' ? note : undefined);
    } catch (err) {
      if (generation !== this.generation) return;
      set(previous);
      this._error.set(coachError(err));
    }
  }
}
