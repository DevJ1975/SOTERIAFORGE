import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import {
  type ApiBadge,
  type ApiCrewBoard,
  type ApiScoreCard,
  GamificationApi,
} from './gamification-api';

const base = 'https://api.example.com';

describe('GamificationApi', () => {
  let api: GamificationApi;
  let http: HttpTestingController;

  function setup(env: object = { apiBaseUrl: base }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: env },
      ],
    });
    api = TestBed.inject(GamificationApi);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('loads the private score card', async () => {
    setup();
    const card: ApiScoreCard = {
      totalXp: 20,
      todayXp: 20,
      level: 1,
      xpIntoLevel: 20,
      xpToNext: 282,
      streakDays: 2,
      strip: Array.from({ length: 14 }, (_, i) => i >= 12),
      crew: null,
    };
    const pending = api.progress();
    const request = http.expectOne(`${base}/api/me/progress`);
    expect(request.request.method).toBe('GET');
    request.flush(card);
    expect(await pending).toEqual(card);
  });

  it("loads the member's own badge catalog", async () => {
    setup();
    const rows: ApiBadge[] = [
      {
        id: 'b1',
        key: 'operator',
        name: 'Operator',
        description: 'Complete 5 lessons.',
        icon: 'badge-operator',
        kind: 'mission',
        state: 'progress',
        progress: { current: 2, target: 5 },
        earnedAt: null,
        awardId: null,
      },
    ];
    const pending = api.badges();
    const request = http.expectOne(`${base}/api/me/badges`);
    expect(request.request.method).toBe('GET');
    request.flush(rows);
    expect(await pending).toEqual(rows);
  });

  it('fetches the signed credential for an earned badge', async () => {
    setup();
    const signed = {
      credential: { name: 'Operator' },
      jwt: 'a.b.c',
      verifyUrl: `${base}/credentials/x`,
    };
    const pending = api.credential('b1');
    const request = http.expectOne(`${base}/api/me/badges/b1/credential`);
    expect(request.request.method).toBe('GET');
    request.flush(signed);
    expect(await pending).toEqual(signed);
  });

  it('asks for the weekly crew board by default', async () => {
    setup();
    const board: ApiCrewBoard = { period: 'weekly', scoring: 'x', cohort: null, crews: [] };
    const pending = api.crewBoard();
    const request = http.expectOne((r) => r.url === `${base}/api/leaderboard/crews`);
    expect(request.request.params.get('period')).toBe('weekly');
    expect(request.request.params.has('cohort')).toBe(false);
    request.flush(board);
    expect(await pending).toEqual(board);
  });

  it('passes the period and, for staff, a cohort', async () => {
    setup();
    const pending = api.crewBoard('allTime', 'cohort-1');
    const request = http.expectOne((r) => r.url === `${base}/api/leaderboard/crews`);
    expect(request.request.params.get('period')).toBe('allTime');
    expect(request.request.params.get('cohort')).toBe('cohort-1');
    request.flush({ period: 'allTime', scoring: 'x', cohort: null, crews: [] });
    await pending;
  });

  it('surfaces API failures to the caller', async () => {
    setup();
    const pending = api.progress();
    http
      .expectOne(`${base}/api/me/progress`)
      .flush({ detail: 'no' }, { status: 403, statusText: 'x' });
    await expect(pending).rejects.toMatchObject({ status: 403 });
  });

  it('refuses to run without a configured API', () => {
    setup({});
    expect(() => api.progress()).toThrow('not configured');
  });
});
