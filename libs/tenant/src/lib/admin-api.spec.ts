import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import {
  BrandingService,
  MemberAdminService,
  ReportsApi,
  TenantAdminService,
  adminErrorMessage,
} from './admin-api';

const BASE = 'http://api.test';

describe('tenant admin API clients', () => {
  let http: HttpTestingController;

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
  });

  afterEach(() => http.verify());

  it('provisionTenant POSTs tenants with the id mapped', async () => {
    const p = TestBed.inject(TenantAdminService).provisionTenant({
      tenantId: 'acme',
      name: 'Acme',
      plan: 'pro',
    });
    const req = http.expectOne(`${BASE}/api/tenants`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 'acme', name: 'Acme', plan: 'pro' });
    req.flush({ id: 'acme' });
    expect(await p).toEqual({ ok: true, tenantId: 'acme' });
  });

  it('setTenantStatus PATCHes the tenant', async () => {
    const p = TestBed.inject(TenantAdminService).setTenantStatus('acme', 'suspended');
    const req = http.expectOne(`${BASE}/api/tenants/acme`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'suspended' });
    req.flush({});
    expect(await p).toEqual({ ok: true });
  });

  it('member calls use member ids', async () => {
    const svc = TestBed.inject(MemberAdminService);

    const invite = svc.inviteMember({ email: 'a@b.co', role: 'learner' });
    http
      .expectOne(`${BASE}/api/members/invite`)
      .flush({ member: { id: 'm1' }, inviteLink: 'https://x/accept-invite?token=t' });
    expect((await invite).inviteLink).toContain('accept-invite');

    const role = svc.setMemberRole('m1', 'instructor');
    const r = http.expectOne(`${BASE}/api/members/m1/role`);
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ role: 'instructor' });
    r.flush({});
    await role;

    const off = svc.deactivateMember('m1');
    const s = http.expectOne(`${BASE}/api/members/m1/status`);
    expect(s.request.body).toEqual({ status: 'deactivated' });
    s.flush({});
    await off;

    const on = svc.reactivateMember('m1');
    const a = http.expectOne(`${BASE}/api/members/m1/status`);
    expect(a.request.body).toEqual({ status: 'active' });
    a.flush({});
    await on;

    const exp = svc.exportMember('m1');
    http.expectOne(`${BASE}/api/members/m1/export`).flush({ member: {} });
    await exp;
  });

  it('ReportsApi GETs reports/enrollments', async () => {
    const p = TestBed.inject(ReportsApi).enrollments();
    http.expectOne(`${BASE}/api/reports/enrollments`).flush([]);
    expect(await p).toEqual([]);
  });

  it('ReportsApi scopes analytics and the at-risk list by course and cohort', async () => {
    const api = TestBed.inject(ReportsApi);

    const all = api.analytics();
    const allReq = http.expectOne(`${BASE}/api/reports/analytics`);
    expect(allReq.request.params.keys()).toEqual([]);
    allReq.flush({ lessons: [] });
    expect(await all).toEqual({ lessons: [] });

    const scoped = api.analytics({ courseId: 'c1', cohortId: null });
    http.expectOne(`${BASE}/api/reports/analytics?courseId=c1`).flush({ lessons: [{}] });
    await scoped;

    const risk = api.atRisk({ courseId: 'c1', cohortId: 'k1' });
    const riskReq = http.expectOne((r) => r.url === `${BASE}/api/reports/at-risk`);
    expect(riskReq.request.params.get('courseId')).toBe('c1');
    expect(riskReq.request.params.get('cohortId')).toBe('k1');
    riskReq.flush({ learners: [] });
    expect(await risk).toEqual({ learners: [] });
  });

  it('BrandingService reads tenant/branding and PUTs updates', async () => {
    const svc = TestBed.inject(BrandingService);

    const none = svc.getBranding();
    http.expectOne(`${BASE}/api/tenant/branding`).flush({ id: 'acme', branding: {} });
    expect(await none).toBeNull();

    const some = svc.getBranding();
    http.expectOne(`${BASE}/api/tenant/branding`).flush({ branding: { colors: {} } });
    expect(await some).toEqual({ colors: {} });

    const put = svc.updateBranding('acme', { colors: { '--a': '#fff' } });
    const req = http.expectOne(`${BASE}/api/tenants/acme/branding`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ colors: { '--a': '#fff' } });
    req.flush({});
    await put;
  });
});

describe('adminErrorMessage', () => {
  const err = (body: unknown) => new HttpErrorResponse({ status: 400, error: body });

  it('prefers detail, then the first field error, then the fallback', () => {
    expect(adminErrorMessage(err({ detail: 'Nope' }), 'x')).toBe('Nope');
    expect(adminErrorMessage(err({ logoUrl: ['Use an https:// URL.'] }), 'x')).toBe(
      'logoUrl: Use an https:// URL.',
    );
    expect(adminErrorMessage(err({ non_field_errors: ['Bad'] }), 'x')).toBe('Bad');
    expect(adminErrorMessage(err(null), 'x')).toBe('x');
    expect(adminErrorMessage(new Error('boom'), 'x')).toBe('x');
  });
});
