import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { AnalyticsService } from './analytics.service';
import { LibraryService } from './library.service';
import { TenantsService } from './tenants.service';

const base = 'https://api.example.com';

describe('superadmin API clients', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: base } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('TenantsService lists, provisions with an admin email, and patches status', async () => {
    const api = TestBed.inject(TenantsService);

    const list = api.list();
    http.expectOne(`${base}/api/tenants`).flush([]);
    expect(await list).toEqual([]);

    const created = api.provision({ id: 'acme', name: 'Acme', adminEmail: 'a@acme.test' });
    const post = http.expectOne(`${base}/api/tenants`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ id: 'acme', name: 'Acme', adminEmail: 'a@acme.test' });
    post.flush({ id: 'acme' });
    await created;

    const patched = api.setStatus('acme', 'suspended');
    const patch = http.expectOne(`${base}/api/tenants/acme`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'suspended' });
    patch.flush({ id: 'acme', status: 'suspended' });
    await patched;
  });

  it('AnalyticsService reads platform analytics', async () => {
    const result = TestBed.inject(AnalyticsService).load();
    http.expectOne(`${base}/api/platform/analytics`).flush({ totals: {}, tenants: [] });
    expect(await result).toEqual({ totals: {}, tenants: [] });
  });

  it('LibraryService authors in the library tenant and shares without that header', async () => {
    const api = TestBed.inject(LibraryService);

    const listed = api.list();
    http.expectOne(`${base}/api/library/courses`).flush([]);
    await listed;

    const created = api.createCourse({ title: 'T' });
    const create = http.expectOne(`${base}/api/courses`);
    expect(create.request.headers.get('X-Forge-Tenant')).toBe('library');
    create.flush({ id: 'c1' });
    await created;

    const lesson = api.addLesson('m1', { title: 'L', contentType: 'video' });
    const addLesson = http.expectOne(`${base}/api/modules/m1/lessons`);
    expect(addLesson.request.headers.get('X-Forge-Tenant')).toBe('library');
    addLesson.flush({ id: 'l1' });
    await lesson;

    const shared = api.share('c1', ['acme']);
    const share = http.expectOne(`${base}/api/library/courses/c1/share`);
    expect(share.request.body).toEqual({ tenantIds: ['acme'] });
    share.flush({ created: [{ tenantId: 'acme', courseId: 'n1' }] });
    expect((await shared).created).toHaveLength(1);
  });
});
