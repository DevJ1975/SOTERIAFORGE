import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, convertToParamMap } from '@angular/router';
import { StandardsApi, type DispatchSession } from '@assurance/standards';
import { Subject } from 'rxjs';
import { parseLaunch, readLaunch, stashLaunch, writeLaunch } from './dispatch-launch';
import {
  DispatchReporter,
  POLL_MS,
  buildStatement,
  isoDuration,
} from './dispatch-reporter.service';

const ORIGINS = ['https://lms.example', 'https://files.lms.example'];

const session = (over: Partial<DispatchSession> = {}): DispatchSession => ({
  dispatchId: 'd1',
  courseId: 'c1',
  courseTitle: 'Lockout Tagout',
  format: 'scorm12',
  lmsOrigins: ORIGINS,
  enrolled: true,
  progressPct: 20,
  completed: false,
  completedAt: null,
  scorePct: null,
  ...over,
});

const launchParams = (over: Record<string, string> = {}) =>
  convertToParamMap({
    endpoint: 'https://lrs.example/xapi',
    fetch: 'https://lrs.example/fetch/abc',
    actor: JSON.stringify({ account: { homePage: 'https://lms.example', name: 'u1' } }),
    registration: 'reg-1',
    activityId: 'https://lms.example/au/1',
    ...over,
  });

interface Call {
  url: string;
  init: RequestInit;
}

describe('DispatchReporter', () => {
  const dispatchSession = jest.fn();
  const events = new Subject<unknown>();
  const postMessage = jest.fn();
  const listeners: Record<string, () => void> = {};
  let fakeWindow: { opener: unknown; addEventListener: jest.Mock };
  let calls: Call[];
  let fetchMock: jest.Mock;
  let reporter: DispatchReporter;

  const statements = () =>
    calls
      .filter((c) => c.url === 'https://lrs.example/xapi/statements')
      .map((c) => JSON.parse(String(c.init.body)) as Record<string, any>);
  const verbs = () => statements().map((s) => s['verb'].display['en-US']);

  beforeEach(() => {
    sessionStorage.clear();
    dispatchSession.mockReset().mockResolvedValue(session());
    postMessage.mockReset();
    calls = [];
    fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url === 'https://lrs.example/fetch/abc')
        return { ok: true, status: 200, json: async () => ({ 'auth-token': 'dG9rZW4=' }) };
      if (url.startsWith('https://lrs.example/xapi/activities/state'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            contextTemplate: {
              extensions: { 'https://w3id.org/xapi/cmi5/context/extensions/sessionid': 's1' },
              contextActivities: { grouping: [{ id: 'https://lms.example/course/1' }] },
            },
          }),
        };
      return { ok: true, status: 204, json: async () => null };
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    fakeWindow = {
      opener: { postMessage },
      addEventListener: jest.fn((name: string, fn: () => void) => (listeners[name] = fn)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: StandardsApi, useValue: { dispatchSession } },
        { provide: Router, useValue: { events } },
        { provide: DOCUMENT, useValue: { defaultView: fakeWindow } },
      ],
    });
    reporter = TestBed.inject(DispatchReporter);
  });

  afterEach(() => {
    reporter.stop();
    jest.useRealTimers();
  });

  describe('SCORM 1.2', () => {
    it('posts once per registered origin on activation, never to *', async () => {
      await reporter.activate('d1');
      expect(reporter.link()).toBe('connected');
      expect(postMessage.mock.calls).toEqual(
        ORIGINS.map((origin) => [
          {
            type: 'forge-dispatch',
            dispatchId: 'd1',
            progressPct: 20,
            completed: false,
            scorePct: null,
          },
          origin,
        ]),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports again only when progress, completion or score changes', async () => {
      await reporter.activate('d1');
      postMessage.mockClear();
      await reporter.tick();
      expect(postMessage).not.toHaveBeenCalled();

      dispatchSession.mockResolvedValue(
        session({ progressPct: 100, completed: true, scorePct: 90 }),
      );
      await reporter.tick();
      expect(postMessage).toHaveBeenCalledTimes(2);
      expect(postMessage.mock.calls[0][0]).toMatchObject({ completed: true, scorePct: 90 });
      expect(reporter.session()?.progressPct).toBe(100);
    });

    it('re-reads every 20 seconds and after each navigation', async () => {
      jest.useFakeTimers();
      await reporter.activate('d1');
      expect(dispatchSession).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(POLL_MS);
      await Promise.resolve();
      expect(dispatchSession).toHaveBeenCalledTimes(2);
      await reporter.tick();
      const before = dispatchSession.mock.calls.length;
      events.next(new NavigationEnd(1, '/courses/c1', '/courses/c1'));
      expect(dispatchSession).toHaveBeenCalledTimes(before + 1);
      await reporter.tick();
      events.next({ type: 'other' });
      expect(dispatchSession).toHaveBeenCalledTimes(before + 1);
    });

    it('is not connected without the LMS window, without origins or without enrollment', async () => {
      fakeWindow.opener = null;
      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');
      expect(reporter.problem()).toContain('from your LMS');
      expect(postMessage).not.toHaveBeenCalled();

      fakeWindow.opener = { postMessage };
      dispatchSession.mockResolvedValue(session({ lmsOrigins: [] }));
      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');

      dispatchSession.mockResolvedValue(session({ enrolled: false }));
      await reporter.activate('d1');
      expect(reporter.problem()).toContain('not enrolled');
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('keeps the last session when a re-read fails, and rejects a failed first load', async () => {
      await reporter.activate('d1');
      dispatchSession.mockImplementation(async () => {
        throw new Error('offline');
      });
      await reporter.tick();
      expect(reporter.session()?.progressPct).toBe(20);
      await expect(reporter.activate('d2')).rejects.toThrow('offline');
    });
  });

  describe('cmi5', () => {
    beforeEach(() => {
      dispatchSession.mockResolvedValue(session({ format: 'cmi5', lmsOrigins: [] }));
      stashLaunch('d1', launchParams());
    });

    it('exchanges the fetch URL once, reads launch data and sends initialized', async () => {
      await reporter.activate('d1');
      expect(reporter.link()).toBe('connected');
      expect(calls[0]).toMatchObject({
        url: 'https://lrs.example/fetch/abc',
        init: { method: 'POST', credentials: 'omit' },
      });
      const state = new URL(calls[1].url);
      expect(state.pathname).toBe('/xapi/activities/state');
      expect(state.searchParams.get('stateId')).toBe('LMS.LaunchData');
      expect(state.searchParams.get('registration')).toBe('reg-1');
      expect(state.searchParams.get('activityId')).toBe('https://lms.example/au/1');
      expect(JSON.parse(state.searchParams.get('agent') ?? '')).toEqual({
        account: { homePage: 'https://lms.example', name: 'u1' },
      });

      expect(verbs()).toEqual(['initialized']);
      const [initialized] = statements();
      expect(initialized['id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(initialized['actor']).toEqual({
        account: { homePage: 'https://lms.example', name: 'u1' },
      });
      expect(initialized['object']).toEqual({
        objectType: 'Activity',
        id: 'https://lms.example/au/1',
      });
      expect(initialized['verb'].id).toBe('http://adlnet.gov/expapi/verbs/initialized');
      expect(initialized['context']).toEqual({
        registration: 'reg-1',
        extensions: { 'https://w3id.org/xapi/cmi5/context/extensions/sessionid': 's1' },
        contextActivities: {
          grouping: [{ id: 'https://lms.example/course/1' }],
          category: [{ id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5' }],
        },
      });
      expect(Date.parse(initialized['timestamp'])).not.toBeNaN();
      expect(initialized['result']).toBeUndefined();
      expect(calls[2].init).toMatchObject({ method: 'POST', credentials: 'omit' });
      expect(calls[2].init.headers).toMatchObject({
        Authorization: 'Basic dG9rZW4=',
        'X-Experience-API-Version': '1.0.3',
        'Content-Type': 'application/json',
      });

      // A reload in the same tab reuses the token and does not initialize twice.
      await reporter.activate('d1');
      expect(calls.filter((c) => c.url === 'https://lrs.example/fetch/abc')).toHaveLength(1);
      expect(verbs()).toEqual(['initialized']);
    });

    it('sends completed exactly once, with the moveon category and a duration', async () => {
      await reporter.activate('d1');
      await reporter.tick();
      expect(verbs()).toEqual(['initialized']);

      dispatchSession.mockResolvedValue(
        session({
          format: 'cmi5',
          lmsOrigins: [],
          progressPct: 100,
          completed: true,
          scorePct: 88,
        }),
      );
      await Promise.all([reporter.tick(), reporter.tick()]);
      await reporter.tick();
      await reporter.retry();
      expect(verbs()).toEqual(['initialized', 'completed']);
      const completed = statements()[1];
      expect(completed['result'].completion).toBe(true);
      expect(completed['result'].duration).toMatch(/^PT\d+(\.\d+)?S$/);
      expect(completed['context'].contextActivities.category).toEqual([
        { id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5' },
        { id: 'https://w3id.org/xapi/cmi5/context/categories/moveon' },
      ]);
      expect(verbs()).not.toContain('passed');
    });

    it('retries completed after the LMS refuses it', async () => {
      dispatchSession.mockResolvedValue(
        session({ format: 'cmi5', lmsOrigins: [], progressPct: 100, completed: true }),
      );
      let refuse = true;
      const ok = fetchMock.getMockImplementation() as (
        u: string,
        i?: RequestInit,
      ) => Promise<unknown>;
      fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
        if (refuse && String(init.body ?? '').includes('verbs/completed')) {
          return { ok: false, status: 500, json: async () => null };
        }
        return ok(url, init);
      });
      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');
      expect(readLaunch('d1')?.completedSent).toBe(false);

      refuse = false;
      await reporter.retry();
      expect(reporter.link()).toBe('connected');
      expect(verbs()).toEqual(['initialized', 'completed']);
    });

    it('sends terminated with keepalive as the page goes away, once', async () => {
      await reporter.activate('d1');
      listeners['pagehide']();
      listeners['pagehide']();
      await Promise.resolve();
      expect(verbs()).toEqual(['initialized', 'terminated']);
      expect(calls[calls.length - 1].init.keepalive).toBe(true);

      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');
      expect(reporter.problem()).toContain('ended');
    });

    it('fails soft when the LMS cannot be reached, and connects on retry', async () => {
      const ok = fetchMock.getMockImplementation() as (
        u: string,
        i?: RequestInit,
      ) => Promise<unknown>;
      fetchMock.mockImplementationOnce(async () => {
        throw new TypeError('network');
      });
      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');
      expect(reporter.problem()).toContain('Could not reach your LMS');
      fetchMock.mockImplementation(ok);
      await reporter.retry();
      expect(reporter.link()).toBe('connected');
    });

    it('is not connected when the page was not opened by an LMS', async () => {
      sessionStorage.clear();
      await reporter.activate('d1');
      expect(reporter.link()).toBe('disconnected');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('launch parameters', () => {
    it('survive in sessionStorage and keep progress for the same launch', () => {
      stashLaunch('d1', launchParams());
      expect(readLaunch('d1')).toEqual({
        endpoint: 'https://lrs.example/xapi/',
        fetch: 'https://lrs.example/fetch/abc',
        actor: { account: { homePage: 'https://lms.example', name: 'u1' } },
        registration: 'reg-1',
        activityId: 'https://lms.example/au/1',
      });
      writeLaunch('d1', { ...readLaunch('d1')!, token: 't', completedSent: true });

      // Back from sign-in with the same URL: nothing is lost.
      stashLaunch('d1', launchParams());
      expect(readLaunch('d1')?.token).toBe('t');
      // No launch in the URL (moving around the course): nothing is lost.
      stashLaunch('d1', convertToParamMap({}));
      expect(readLaunch('d1')?.completedSent).toBe(true);
      // A new launch from the LMS starts clean.
      stashLaunch('d1', launchParams({ fetch: 'https://lrs.example/fetch/new' }));
      expect(readLaunch('d1')?.token).toBeUndefined();
      expect(readLaunch('d2')).toBeNull();
    });

    it('rejects incomplete, non-https or malformed launches', () => {
      expect(parseLaunch(convertToParamMap({}))).toBeNull();
      expect(parseLaunch(launchParams({ endpoint: 'http://lrs.example/xapi' }))).toBeNull();
      expect(parseLaunch(launchParams({ fetch: 'javascript:alert(1)' }))).toBeNull();
      expect(parseLaunch(launchParams({ actor: 'not json' }))).toBeNull();
      expect(parseLaunch(launchParams({ actor: '[]' }))).toBeNull();
      expect(parseLaunch(launchParams({ endpoint: 'http://localhost:8000/xapi/' }))?.endpoint).toBe(
        'http://localhost:8000/xapi/',
      );
    });
  });

  it('formats durations and terminated results', () => {
    expect(isoDuration(0)).toBe('PT0S');
    expect(isoDuration(90_500)).toBe('PT90.5S');
    expect(isoDuration(-5)).toBe('PT0S');
    const launch = parseLaunch(launchParams())!;
    launch.initializedAt = '2026-11-21T15:00:00.000Z';
    const terminated = buildStatement(launch, 'terminated', new Date('2026-11-21T15:01:00.000Z'));
    expect(terminated['result']).toEqual({ duration: 'PT60S' });
  });
});
