import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, AuthService, TenantService } from '@assurance/auth';
import { CoachApi, CoachRequestError, createSseParser, type SseEvent } from './coach-api';

const base = 'http://localhost:8000';
const answer = {
  exchangeId: 'x1',
  answer: 'Basil needs sunlight.',
  abstained: false,
  citations: [],
  diagram: null,
  followUps: [],
};
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A fetch Response whose body yields the given text chunks. */
function streamOf(chunks: string[], init: { status?: number } = {}) {
  const queue = chunks.map((chunk) => new TextEncoder().encode(chunk));
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => JSON.parse(chunks.join('')),
    body: {
      getReader: () => ({
        read: async () =>
          queue.length ? { done: false, value: queue.shift() } : { done: true, value: undefined },
        cancel: async () => undefined,
      }),
    },
  };
}

describe('createSseParser', () => {
  const collect = () => {
    const events: SseEvent[] = [];
    return { events, parser: createSseParser((e) => events.push(e)) };
  };

  it('emits one event per blank-line-terminated block', () => {
    const { events, parser } = collect();
    parser.push('event: delta\ndata: {"text":"a"}\n\nevent: done\ndata: {}\n\n');
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('reassembles events split anywhere, including inside a CRLF', () => {
    const { events, parser } = collect();
    const text = 'event: delta\r\ndata: {"text":"hello"}\r\n\r\n';
    for (const ch of text) parser.push(ch);
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hello"}' }]);
  });

  it('ignores comments, joins multi-line data and defaults the event name', () => {
    const { events, parser } = collect();
    parser.push(': keep-alive\n\ndata: one\ndata: two\n\n');
    expect(events).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });
});

describe('CoachApi.askStream', () => {
  let api: CoachApi;
  let fetchMock: jest.Mock;
  const getAccessToken = jest.fn();
  const renewAccessToken = jest.fn();
  const original = globalThis.fetch;

  beforeEach(() => {
    getAccessToken.mockReset().mockResolvedValue('token-1');
    renewAccessToken.mockReset().mockResolvedValue('token-2');
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: base } },
        { provide: AuthService, useValue: { getAccessToken, renewAccessToken } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    });
    api = TestBed.inject(CoachApi);
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  const input = { question: 'Q', courseId: 'c1', moduleId: 'm1' };

  it('posts with the token and tenant, reports progress and resolves the final answer', async () => {
    const body = sse('status', { stage: 'generating' }) + sse('delta', { text: 'Basil ' });
    // Split mid-event to prove chunk boundaries do not matter.
    fetchMock.mockResolvedValue(
      streamOf([
        body.slice(0, 20),
        body.slice(20),
        sse('delta', { text: 'needs' }),
        sse('done', answer),
      ]),
    );
    const stages: string[] = [];
    const text: string[] = [];
    const result = await api.askStream(input, {
      onStatus: (s) => stages.push(s),
      onDelta: (t) => text.push(t),
    });
    expect(result).toEqual(answer);
    expect(stages).toEqual(['generating']);
    expect(text.join('')).toBe('Basil needs');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${base}/api/coach/ask/stream`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(init.headers['X-Forge-Tenant']).toBe('acme');
    expect(JSON.parse(init.body)).toEqual({
      question: 'Q',
      courseId: 'c1',
      agent: 'general',
      moduleId: 'm1',
    });
  });

  it('rejects with the detail of an error event', async () => {
    fetchMock.mockResolvedValue(
      streamOf([
        sse('delta', { text: 'Half' }),
        sse('error', { detail: 'The tutor is unavailable.', status: 503 }),
      ]),
    );
    const failure = await api.askStream(input).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(CoachRequestError);
    expect(failure).toMatchObject({ message: 'The tutor is unavailable.', status: 503 });
  });

  it('treats a stream that ends without done as an error', async () => {
    fetchMock.mockResolvedValue(streamOf([sse('delta', { text: 'Half' })]));
    await expect(api.askStream(input)).rejects.toThrow('cut off');
  });

  it('reads an ordinary JSON error for a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      streamOf([JSON.stringify({ detail: 'The local tutor is busy.' })], { status: 503 }),
    );
    await expect(api.askStream(input)).rejects.toMatchObject({
      message: 'The local tutor is busy.',
      status: 503,
    });
  });

  it('retries once with a renewed token after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(streamOf(['{}'], { status: 401 }))
      .mockResolvedValueOnce(streamOf([sse('done', answer)]));
    await expect(api.askStream(input)).resolves.toEqual(answer);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-2');
  });

  it('stops when the caller aborts', async () => {
    const abort = new AbortController();
    fetchMock.mockImplementation(
      (_url, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const pending = api.askStream(input, { signal: abort.signal });
    await Promise.resolve();
    abort.abort();
    await expect(pending).rejects.toThrow('cancelled');
  });
});

describe('CoachApi feedback and review', () => {
  let api: CoachApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: base } },
      ],
    });
    api = TestBed.inject(CoachApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts a rating, with a note only when there is one', async () => {
    const pending = api.rate('x1', 'down', '  Wrong page ');
    const request = http.expectOne(`${base}/api/coach/exchanges/x1/rating`);
    expect(request.request.body).toEqual({ rating: 'down', note: 'Wrong page' });
    request.flush(null);
    await pending;
    const cleared = api.rate('x1', null);
    const second = http.expectOne(`${base}/api/coach/exchanges/x1/rating`);
    expect(second.request.body).toEqual({ rating: null });
    second.flush(null);
    await cleared;
  });

  it('loads the review queue and marks an item reviewed', async () => {
    const list = api.review('reviewed', 14);
    const get = http.expectOne((r) => r.url === `${base}/api/coach/review`);
    expect(get.request.params.get('status')).toBe('reviewed');
    expect(get.request.params.get('days')).toBe('14');
    get.flush({ summary: {}, items: [] });
    await list;
    const update = api.updateReview('e1', 'reviewed', 'Source fixed');
    const post = http.expectOne(`${base}/api/coach/review/e1`);
    expect(post.request.body).toEqual({ status: 'reviewed', note: 'Source fixed' });
    post.flush({ id: 'e1' });
    await update;
  });
});
