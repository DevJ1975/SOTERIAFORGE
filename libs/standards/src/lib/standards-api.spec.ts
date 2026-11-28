import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { StandardsApi, attachmentFilename } from './standards-api';

const BASE = 'http://api.test';

describe('StandardsApi LMS exports', () => {
  let http: HttpTestingController;
  let api: StandardsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ASSURANCE_ENV,
          useValue: { production: false, rootDomain: 'x', apiBaseUrl: BASE },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(StandardsApi);
  });

  afterEach(() => http.verify());

  it('lists, creates and updates dispatches', async () => {
    const list = api.dispatches();
    http.expectOne(`${BASE}/api/standards/dispatches`).flush([]);
    expect(await list).toEqual([]);

    const input = {
      courseId: 'c1',
      format: 'scorm12' as const,
      lmsOrigins: ['https://lms.example'],
    };
    const created = api.createDispatch(input);
    const post = http.expectOne(`${BASE}/api/standards/dispatches`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(input);
    post.flush({ id: 'd1' });
    expect(await created).toEqual({ id: 'd1' });

    const updated = api.updateDispatch('d1', { revoked: true });
    const patch = http.expectOne(`${BASE}/api/standards/dispatches/d1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ revoked: true });
    patch.flush({ id: 'd1', revoked: true });
    await updated;
  });

  it('downloads the package as a blob named by the server', async () => {
    const zip = new Blob(['PK'], { type: 'application/zip' });
    const named = api.dispatchPackage({ id: 'd1', format: 'scorm12' });
    const req = http.expectOne(`${BASE}/api/standards/dispatches/d1/package`);
    expect(req.request.responseType).toBe('blob');
    req.flush(zip, {
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="lockout.zip"' }),
    });
    expect(await named).toEqual({ blob: zip, filename: 'lockout.zip' });

    const fallback = api.dispatchPackage({ id: 'd2', format: 'cmi5' });
    http.expectOne(`${BASE}/api/standards/dispatches/d2/package`).flush(zip);
    expect((await fallback).filename).toBe('forge-cmi5.zip');
  });

  it("reads the learner's dispatch session", async () => {
    const session = api.dispatchSession('d1');
    http.expectOne(`${BASE}/api/standards/dispatches/d1/session`).flush({ progressPct: 40 });
    expect(await session).toEqual({ progressPct: 40 });
  });

  it('parses attachment filenames without trusting path separators', () => {
    expect(attachmentFilename(null)).toBeNull();
    expect(attachmentFilename('attachment')).toBeNull();
    expect(attachmentFilename('attachment; filename=a.zip')).toBe('a.zip');
    expect(attachmentFilename("attachment; filename*=UTF-8''caf%C3%A9.zip")).toBe('café.zip');
    expect(attachmentFilename('attachment; filename="../x.zip"')).toBe('.._x.zip');
  });
});
