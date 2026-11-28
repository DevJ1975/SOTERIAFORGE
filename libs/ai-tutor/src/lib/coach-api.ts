import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { ASSURANCE_ENV, AuthService, TenantService, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';

export interface CoachCourse {
  id: string;
  title: string;
}

export type CoachAgentId = 'general' | 'workplace-ai' | 'cybersecurity-ai';

export interface CoachReference {
  id: string;
  title: string;
  url: string;
  edition: string;
  status: 'pending_instructor_review';
  checkedOn: string;
}

export interface CoachProfile {
  id: CoachAgentId;
  title: string;
  description: string;
  references: CoachReference[];
}

export interface CoachSource {
  id: string;
  courseId: string;
  title: string;
  chunkCount: number;
  updatedAt: string;
  agent: CoachAgentId;
  referenceUrl: string;
  edition: string;
  /** The module this source is limited to; null or absent = the whole course. */
  moduleId?: string | null;
}

export interface CoachCitation {
  sourceId: string;
  chunkId: number;
  label: string;
  courseId: string;
  page: number | null;
}

interface DiagramBase {
  title: string;
  /** Server-written text alternative; always shown to assistive technology. */
  alt: string;
}
export interface DiagramItem {
  label: string;
  detail?: string;
}
export interface DiagramGroup {
  label: string;
  points: string[];
}
export interface DiagramAxis {
  label: string;
  low: string;
  high: string;
}
export type CoachDiagram =
  | (DiagramBase & { type: 'linear_flow'; steps: DiagramItem[] })
  | (DiagramBase & { type: 'before_after'; before: DiagramGroup; after: DiagramGroup })
  | (DiagramBase & { type: 'comparison'; columns: DiagramGroup[] })
  | (DiagramBase & {
      type: 'two_by_two';
      xAxis: DiagramAxis;
      yAxis: DiagramAxis;
      /** Top-left, top-right, bottom-left, bottom-right. */
      quadrants: DiagramItem[];
    });

export interface TutorAnswer {
  /** Null when the exchange was not logged; rating is then unavailable. */
  exchangeId?: string | null;
  answer: string;
  abstained: boolean;
  citations: CoachCitation[];
  diagram?: CoachDiagram | null;
  followUps?: string[];
}

export interface AskInput {
  question: string;
  courseId: string;
  agent?: CoachAgentId;
  /** Narrows retrieval to this module's sources plus course-wide ones. */
  moduleId?: string;
}

export type CoachStage = 'retrieving' | 'generating';

export interface AskStreamHandlers {
  signal?: AbortSignal;
  onStatus?: (stage: CoachStage) => void;
  /** Unvalidated text as it is written; the resolved answer replaces it. */
  onDelta?: (text: string) => void;
}

export type CoachRating = 'up' | 'down' | null;
export type ReviewStatus = 'open' | 'reviewed';

export interface ReviewItem {
  id: string;
  createdAt: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  agent: CoachAgentId;
  /** A pseudonym such as "Learner 3f2a", never a name. */
  learner: string;
  question: string;
  answer: string;
  abstained: boolean;
  blocked: boolean;
  rating: CoachRating;
  ratingNote: string;
  citations: { label: string }[];
  reason: 'thumbs_down' | 'abstained' | 'blocked';
  status: ReviewStatus;
  reviewNote: string;
  diagram: CoachDiagram | null;
}

export interface ReviewQueue {
  summary: {
    days: number;
    asked: number;
    helpful: number;
    unhelpful: number;
    abstained: number;
    /** 0 to 1, or null when nothing has been rated. */
    helpfulRate: number | null;
  };
  items: ReviewItem[];
}

/** A failed coach request made with fetch (the streaming endpoint). */
export class CoachRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CoachRequestError';
  }
}

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Incremental Server-Sent Events parser: feed it decoded text in any chunking and it
 * calls back once per complete event. Comments and unknown fields are ignored.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): {
  push(text: string): void;
} {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  const line = (raw: string) => {
    if (raw === '') {
      if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
      event = '';
      data = [];
      return;
    }
    if (raw.startsWith(':')) return;
    const colon = raw.indexOf(':');
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  return {
    push(text: string): void {
      buffer += text;
      for (;;) {
        const match = /\r\n|\n|\r/.exec(buffer);
        if (!match) return;
        // A lone CR at the very end may be the first half of a CRLF still in transit.
        if (match[0] === '\r' && match.index === buffer.length - 1) return;
        line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
    },
  };
}

function detailOf(body: unknown): string | null {
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail;
  }
  return null;
}

export function coachError(error: unknown): string {
  if (error instanceof CoachRequestError) return error.message;
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object') {
      if ('detail' in body && typeof body.detail === 'string') return body.detail;
      return `The tutor rejected the request: ${JSON.stringify(body)}`;
    }
    return 'The local tutor API could not be reached.';
  }
  return error instanceof Error ? error.message : 'The local tutor request failed.';
}

@Injectable({ providedIn: 'root' })
export class CoachApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;
  // Resolved on first use: only the streaming call needs the session directly.
  private readonly injector = inject(Injector);

  url(path: string): string {
    if (!this.base) throw new Error('Configure the Forge API URL to use the local tutor.');
    return forgeApiUrl(this.base, `/api/coach/${path}`);
  }

  async courses(): Promise<CoachCourse[]> {
    return firstValueFrom(this.http.get<CoachCourse[]>(this.url('courses')));
  }

  async profiles(): Promise<CoachProfile[]> {
    return firstValueFrom(this.http.get<CoachProfile[]>(this.url('profiles')));
  }

  async sources(): Promise<CoachSource[]> {
    return firstValueFrom(this.http.get<CoachSource[]>(this.url('sources')));
  }

  async remove(sourceId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`sources/${sourceId}`)));
  }

  async ask(
    question: string,
    courseId: string,
    signal?: AbortSignal,
    agent: CoachAgentId = 'general',
    moduleId?: string,
  ): Promise<TutorAnswer> {
    const request = this.http
      .post<TutorAnswer>(this.url('ask'), this.body({ question, courseId, agent, moduleId }))
      .pipe(timeout(120_000));
    return firstValueFrom(signal ? request.pipe(takeUntil(fromEvent(signal, 'abort'))) : request);
  }

  private body(input: AskInput): Record<string, string> {
    return {
      question: input.question,
      courseId: input.courseId,
      agent: input.agent ?? 'general',
      ...(input.moduleId ? { moduleId: input.moduleId } : {}),
    };
  }

  /**
   * Asks over Server-Sent Events. Text arrives through `onDelta` as it is written; the
   * promise resolves with the validated answer, which replaces whatever was streamed.
   * HttpClient cannot read a streamed POST, so this uses fetch with the same token and
   * tenant headers `forgeApiInterceptor` sends.
   */
  async askStream(input: AskInput, handlers: AskStreamHandlers = {}): Promise<TutorAnswer> {
    const url = this.url('ask/stream');
    const auth = this.injector.get(AuthService);
    const tenantId = this.injector.get(TenantService).tenantId();
    const abort = new AbortController();
    const cancel = () => abort.abort();
    if (handlers.signal?.aborted) cancel();
    handlers.signal?.addEventListener('abort', cancel);
    const timer = setTimeout(cancel, 120_000);
    const send = (token: string | null) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenantId ? { 'X-Forge-Tenant': tenantId } : {}),
        },
        body: JSON.stringify(this.body(input)),
        signal: abort.signal,
      });
    try {
      const token = await auth.getAccessToken();
      let response = await send(token);
      if (response.status === 401 && token) {
        // The token may have expired in flight; one retry, as the interceptor does.
        const renewed = await auth.renewAccessToken();
        if (renewed) response = await send(renewed);
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new CoachRequestError(
          detailOf(body) ??
            (response.status === 429
              ? 'Too many questions in a short time. Wait a minute and try again.'
              : 'The tutor could not answer. Try again.'),
          response.status,
        );
      }
      if (!response.body) throw new CoachRequestError('The tutor sent no answer.', 0);

      let done: TutorAnswer | undefined;
      let failure: CoachRequestError | undefined;
      const parser = createSseParser(({ event, data }) => {
        if (done || failure) return;
        let value: unknown;
        try {
          value = JSON.parse(data);
        } catch {
          return;
        }
        if (!value || typeof value !== 'object') return;
        const fields = value as Record<string, unknown>;
        if (
          event === 'status' &&
          (fields['stage'] === 'retrieving' || fields['stage'] === 'generating')
        ) {
          handlers.onStatus?.(fields['stage']);
        } else if (event === 'delta' && typeof fields['text'] === 'string') {
          handlers.onDelta?.(fields['text']);
        } else if (event === 'done') {
          done = value as TutorAnswer;
        } else if (event === 'error') {
          failure = new CoachRequestError(
            detailOf(value) ?? 'The tutor could not answer. Try again.',
            typeof fields['status'] === 'number' ? fields['status'] : 0,
          );
        }
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parser.push(decoder.decode(chunk.value, { stream: true }));
        if (done || failure) {
          void reader.cancel().catch(() => undefined);
          break;
        }
      }
      parser.push(decoder.decode() + '\n\n');
      if (failure) throw failure;
      if (!done) throw new CoachRequestError('The answer was cut off. Try again.', 0);
      return done;
    } catch (error) {
      if (error instanceof CoachRequestError) throw error;
      if (handlers.signal?.aborted) throw new CoachRequestError('The question was cancelled.', 0);
      if (abort.signal.aborted) {
        throw new CoachRequestError('The tutor took too long to answer. Try again.', 0);
      }
      throw new CoachRequestError('The tutor API could not be reached.', 0);
    } finally {
      clearTimeout(timer);
      handlers.signal?.removeEventListener('abort', cancel);
    }
  }

  /** Thumbs up or down on an answer; null clears it. Only the asker may rate. */
  async rate(exchangeId: string, rating: CoachRating, note?: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(this.url(`exchanges/${encodeURIComponent(exchangeId)}/rating`), {
        rating,
        ...(note?.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  /** Staff: answers that need a look (thumbs down, abstained or blocked) and the totals. */
  async review(status: ReviewStatus | 'all' = 'open', days = 7): Promise<ReviewQueue> {
    return firstValueFrom(
      this.http.get<ReviewQueue>(this.url('review'), { params: { status, days } }),
    );
  }

  async updateReview(id: string, status: ReviewStatus, note?: string): Promise<ReviewItem> {
    return firstValueFrom(
      this.http.post<ReviewItem>(this.url(`review/${encodeURIComponent(id)}`), {
        status,
        ...(note?.trim() ? { note: note.trim() } : {}),
      }),
    );
  }
}
