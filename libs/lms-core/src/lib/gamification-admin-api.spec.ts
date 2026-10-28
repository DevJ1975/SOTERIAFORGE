import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import {
  type ApiBadgeDefinition,
  GamificationAdminApi,
  gamificationAdminErrorMessage,
} from './gamification-admin-api';

const base = 'https://api.example.com';

describe('GamificationAdminApi', () => {
  let api: GamificationAdminApi;
  let http: HttpTestingController;

  function setup(env: object = { apiBaseUrl: base }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: env },
      ],
    });
    api = TestBed.inject(GamificationAdminApi);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('lists and creates cohorts', async () => {
    setup();
    const list = api.cohorts();
    const get = http.expectOne(`${base}/api/cohorts`);
    expect(get.request.method).toBe('GET');
    get.flush([]);
    expect(await list).toEqual([]);

    const created = api.createCohort({ name: 'Spring', startsOn: '2026-03-01' });
    const post = http.expectOne(`${base}/api/cohorts`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'Spring', startsOn: '2026-03-01' });
    post.flush({ id: 'c1', name: 'Spring', startsOn: '2026-03-01', endsOn: null });
    expect((await created).id).toBe('c1');
  });

  it('loads a cohort tree, adds sections and crews and replaces a roster', async () => {
    setup();
    const tree = api.cohort('c1');
    http.expectOne(`${base}/api/cohorts/c1`).flush({
      id: 'c1',
      name: 'Spring',
      startsOn: null,
      endsOn: null,
      sections: [],
    });
    expect((await tree).sections).toEqual([]);

    const section = api.createSection('c1', 'Day shift');
    const s = http.expectOne(`${base}/api/cohorts/c1/sections`);
    expect(s.request.body).toEqual({ name: 'Day shift' });
    s.flush({ id: 's1', name: 'Day shift' });
    await section;

    const crew = api.createCrew('s1', 'Alpha');
    const c = http.expectOne(`${base}/api/sections/s1/crews`);
    expect(c.request.body).toEqual({ name: 'Alpha' });
    c.flush({ id: 'k1', name: 'Alpha' });
    await crew;

    const roster = api.setCrewMembers('k1', ['m1', 'm2']);
    const r = http.expectOne(`${base}/api/crews/k1/members`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ memberIds: ['m1', 'm2'] });
    r.flush({ id: 'k1', name: 'Alpha' });
    await roster;

    const led = api.setCrewMembers('k1', ['m1'], ['m1']);
    const l = http.expectOne(`${base}/api/crews/k1/members`);
    expect(l.request.body).toEqual({ memberIds: ['m1'], leadIds: ['m1'] });
    l.flush({ id: 'k1', name: 'Alpha' });
    await led;
  });

  it('manages badges and signs them off', async () => {
    setup();
    const badge: ApiBadgeDefinition = {
      id: 'b1',
      key: 'first',
      name: 'First',
      description: '',
      icon: 'badge-recruit',
      kind: 'mission',
      rule: 'lessons_completed',
      target: 1,
      order: 0,
      active: true,
    };
    const list = api.badges();
    http.expectOne(`${base}/api/badges`).flush([badge]);
    expect(await list).toEqual([badge]);

    const created = api.createBadge({ ...badge });
    const post = http.expectOne(`${base}/api/badges`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(badge);
    post.flush(badge);
    expect(await created).toEqual(badge);
  });

  it('patches, deletes and awards by badge id', async () => {
    setup();
    const patched = api.updateBadge('b1', { active: false });
    const p = http.expectOne(`${base}/api/badges/b1`);
    expect(p.request.method).toBe('PATCH');
    expect(p.request.body).toEqual({ active: false });
    p.flush({});
    await patched;

    const deleted = api.deleteBadge('b1');
    const d = http.expectOne(`${base}/api/badges/b1`);
    expect(d.request.method).toBe('DELETE');
    d.flush(null, { status: 204, statusText: 'No Content' });
    await deleted;

    const awarded = api.awardBadge('b1', 'm1');
    const a = http.expectOne(`${base}/api/badges/b1/award`);
    expect(a.request.body).toEqual({ memberId: 'm1' });
    a.flush(null, { status: 201, statusText: 'Created' });
    await awarded;
  });

  it('rejects when the API is not configured', () => {
    setup({ apiBaseUrl: '' });
    expect(() => api.cohorts()).toThrow('not configured');
  });

  it('reads detail, field errors and bare message lists', () => {
    const err = (error: unknown, status = 400) =>
      new HttpErrorResponse({ error, status, statusText: 'x' });
    expect(gamificationAdminErrorMessage(err({ detail: 'No.' }, 403), 'f')).toBe('No.');
    expect(gamificationAdminErrorMessage(err({ name: ['Taken.'] }), 'f')).toBe('name: Taken.');
    expect(gamificationAdminErrorMessage(err(['Retire it instead.']), 'f')).toBe(
      'Retire it instead.',
    );
    expect(gamificationAdminErrorMessage(err(null, 500), 'fallback')).toBe('fallback');
    expect(gamificationAdminErrorMessage(new Error('x'), 'fallback')).toBe('fallback');
  });
});
