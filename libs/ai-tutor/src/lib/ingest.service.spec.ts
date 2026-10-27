import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { IngestService } from './ingest.service';
import { CoachApi } from './coach-api';

describe('Local coach HTTP API', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'http://localhost:8000' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('ingests approved course text via Django, not Firebase', async () => {
    const promise = TestBed.inject(IngestService).ingest({
      sourceId: 's1',
      courseId: 'c1',
      label: 'Guide',
      text: 'Course material',
      approved: true,
    });
    const request = http.expectOne('http://localhost:8000/api/coach/sources/s1');
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as FormData;
    expect(body.get('courseId')).toBe('c1');
    expect(body.get('text')).toBe('Course material');
    expect(body.get('approved')).toBe('true');
    expect(body.has('tenantId')).toBe(false);
    request.flush({ ok: true, chunks: 1 });
    expect(await promise).toEqual({ ok: true, chunks: 1 });
  });

  it('uploads a file without also sending stale pasted text', async () => {
    const promise = TestBed.inject(IngestService).ingest({
      sourceId: 's1',
      courseId: 'c1',
      label: 'Guide',
      text: 'Old text',
      file: new File(['# Guide'], 'guide.md'),
      approved: true,
    });
    const request = http.expectOne('http://localhost:8000/api/coach/sources/s1');
    expect((request.request.body as FormData).has('file')).toBe(true);
    expect((request.request.body as FormData).has('text')).toBe(false);
    request.flush({ ok: true, chunks: 1 });
    await promise;
  });

  it('asks Django with course ID, question, and the default general agent', async () => {
    const promise = TestBed.inject(CoachApi).ask('Question', 'c1');
    const request = http.expectOne('http://localhost:8000/api/coach/ask');
    expect(request.request.body).toEqual({
      question: 'Question',
      courseId: 'c1',
      agent: 'general',
    });
    request.flush({ answer: 'Unavailable in sources', citations: [], abstained: true });
    expect((await promise).abstained).toBe(true);
  });

  it('sends specialist provenance with explicitly approved source content', async () => {
    const promise = TestBed.inject(IngestService).ingest({
      sourceId: 's1',
      courseId: 'c1',
      label: 'Reviewed guidance',
      text: 'Approved excerpt',
      approved: true,
      agent: 'workplace-ai',
      referenceUrl: 'https://www.nist.gov/',
      edition: 'Instructor review, 2026-10-27',
    });
    const request = http.expectOne('http://localhost:8000/api/coach/sources/s1');
    const body = request.request.body as FormData;
    expect(body.get('agent')).toBe('workplace-ai');
    expect(body.get('referenceUrl')).toBe('https://www.nist.gov/');
    expect(body.get('edition')).toBe('Instructor review, 2026-10-27');
    request.flush({ ok: true, chunks: 1 });
    await promise;
  });

  it('propagates outages to the caller', async () => {
    const promise = TestBed.inject(CoachApi).ask('Question', 'c1');
    http
      .expectOne('http://localhost:8000/api/coach/ask')
      .flush({ detail: 'Busy' }, { status: 503, statusText: 'Unavailable' });
    await expect(promise).rejects.toMatchObject({ status: 503 });
  });

  it('cancels the browser HTTP request when the chat context is reset', async () => {
    const controller = new AbortController();
    const promise = TestBed.inject(CoachApi).ask('Question', 'c1', controller.signal);
    const rejection = expect(promise).rejects.toBeDefined();
    const request = http.expectOne('http://localhost:8000/api/coach/ask');
    controller.abort();
    expect(request.cancelled).toBe(true);
    await rejection;
  });

  it('reports missing API configuration through a rejected promise', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: {} },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await expect(TestBed.inject(CoachApi).courses()).rejects.toThrow('Configure the Forge API URL');
  });
});
