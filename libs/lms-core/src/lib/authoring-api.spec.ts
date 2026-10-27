import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { AuthoringApi } from './authoring-api';

const base = 'https://api.example.com';

describe('AuthoringApi', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;

  function setup(env: object = { apiBaseUrl: base }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: env },
      ],
    });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('creates a course and updates its fields', async () => {
    setup();
    const created = api.createCourse({ title: 'Safety', tags: ['osha'] });
    const post = http.expectOne(`${base}/api/courses`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ title: 'Safety', tags: ['osha'] });
    post.flush({ id: 'c1', status: 'draft' });
    expect(await created).toMatchObject({ id: 'c1' });

    const updated = api.updateCourse('c1', { availableOffline: true });
    const patch = http.expectOne(`${base}/api/courses/c1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ availableOffline: true });
    patch.flush({ id: 'c1' });
    await updated;
  });

  it('publishes and unpublishes through the status field only', async () => {
    setup();
    const published = api.publish('c1');
    const a = http.expectOne(`${base}/api/courses/c1`);
    expect(a.request.body).toEqual({ status: 'published' });
    a.flush({});
    await published;

    const draft = api.unpublish('c1');
    const b = http.expectOne(`${base}/api/courses/c1`);
    expect(b.request.body).toEqual({ status: 'draft' });
    b.flush({});
    await draft;
  });

  it('assigns a course to members', async () => {
    setup();
    const result = api.assign('c1', { memberIds: ['m1', 'm2'], dueAt: '2026-11-01T00:00:00.000Z' });
    const req = http.expectOne(`${base}/api/courses/c1/assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      memberIds: ['m1', 'm2'],
      dueAt: '2026-11-01T00:00:00.000Z',
    });
    req.flush({ assigned: 2, skipped: 0 });
    expect(await result).toEqual({ assigned: 2, skipped: 0 });
  });

  it('adds, edits, reorders and deletes modules and lessons', async () => {
    setup();
    const mod = api.addModule('c1', { title: 'Intro', label: 'Week 1' });
    const addModule = http.expectOne(`${base}/api/courses/c1/modules`);
    expect(addModule.request.body).toEqual({ title: 'Intro', label: 'Week 1' });
    addModule.flush({ id: 'm1' });
    await mod;

    const lesson = api.addLesson('m1', {
      title: 'Video',
      contentType: 'video',
      externalUrl: 'https://youtu.be/a',
      quizId: null,
    });
    const addLesson = http.expectOne(`${base}/api/modules/m1/lessons`);
    expect(addLesson.request.body).toMatchObject({ contentType: 'video', quizId: null });
    addLesson.flush({ id: 'l1' });
    await lesson;

    const reorder = api.reorderLessons(['l2', 'l1']);
    const first = http.expectOne(`${base}/api/lessons/l2`);
    const second = http.expectOne(`${base}/api/lessons/l1`);
    expect(first.request.body).toEqual({ order: 0 });
    expect(second.request.body).toEqual({ order: 1 });
    first.flush({});
    second.flush({});
    await reorder;

    const reorderModules = api.reorderModules(['m2', 'm1']);
    http.expectOne(`${base}/api/modules/m2`).flush({});
    http.expectOne(`${base}/api/modules/m1`).flush({});
    await reorderModules;

    const delLesson = api.deleteLesson('l1');
    const d1 = http.expectOne(`${base}/api/lessons/l1`);
    expect(d1.request.method).toBe('DELETE');
    d1.flush(null, { status: 204, statusText: 'No Content' });
    await delLesson;

    const delModule = api.deleteModule('m1');
    http.expectOne(`${base}/api/modules/m1`).flush(null, { status: 204, statusText: 'No Content' });
    await delModule;
  });

  it('reads and writes quizzes and games', async () => {
    setup();
    const quiz = api.updateQuiz('q1', { passThreshold: 80, maxAttempts: null, questions: [] });
    const q = http.expectOne(`${base}/api/quizzes/q1`);
    expect(q.request.method).toBe('PATCH');
    expect(q.request.body).toEqual({ passThreshold: 80, maxAttempts: null, questions: [] });
    q.flush({ id: 'q1' });
    await quiz;

    const created = api.createGame({
      title: 'Flip',
      engine: 'phaser',
      config: { kind: 'flip_reveal' },
    });
    const g = http.expectOne(`${base}/api/games`);
    expect(g.request.method).toBe('POST');
    g.flush({ id: 'g1' });
    await created;

    const del = api.deleteGame('g1');
    http.expectOne(`${base}/api/games/g1`).flush(null, { status: 204, statusText: 'No Content' });
    await del;
  });

  it('uploads an asset as multipart form data', async () => {
    setup();
    const pending = api.uploadAsset(new Blob(['abc'], { type: 'video/mp4' }), 'clip.mp4');
    const req = http.expectOne(`${base}/api/assets`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect((body.get('file') as File).name).toBe('clip.mp4');
    req.flush({
      id: 'a1',
      assetRef: 'asset:a1',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      size: 3,
    });
    expect((await pending).assetRef).toBe('asset:a1');

    const url = api.assetUrl('a1');
    http.expectOne(`${base}/api/assets/a1/url`).flush({ url: 'https://cdn/x', expiresIn: 300 });
    expect((await url).url).toBe('https://cdn/x');
  });

  it('refuses to call without an API base url', () => {
    setup({});
    expect(() => api.courses()).toThrow('The Forge API is not configured.');
  });
});
