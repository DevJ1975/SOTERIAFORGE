import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { sessionState, T0 } from './engage-session.fixtures';
import {
  DISCOVER_MS,
  EngageSessionStore,
  HEARTBEAT_MS,
  STATE_POLL_MS,
} from './engage-session.store';

const api = 'https://api.example.com/api/engage';
const stateUrl = `${api}/sessions/session-1/state`;
const beatUrl = `${api}/sessions/session-1/heartbeat`;

describe('EngageSessionStore', () => {
  let store: EngageSessionStore;
  let http: HttpTestingController;

  /** Let the promise chains behind a flushed request run. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }

  /** Attach to a classroom with a live session and answer the first state + heartbeat. */
  async function attach(state = sessionState()): Promise<void> {
    store.attach('room-1', 'session-1');
    http.expectOne(stateUrl).flush(state);
    http.expectOne(beatUrl).flush(null);
    await settle();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    TestBed.configureTestingModule({
      providers: [
        EngageSessionStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'https://api.example.com' } },
      ],
    });
    store = TestBed.inject(EngageSessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.detach();
    http.verify();
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads the state and sends a heartbeat as soon as it follows a session', async () => {
    await attach();
    expect(store.state()?.title).toBe('Week 5 lab day');
    expect(store.live()).toBe(true);
    expect(store.isHost()).toBe(false);
  });

  it('does nothing over the network when the classroom has no session', () => {
    store.attach('room-1', null);
    jest.advanceTimersByTime(STATE_POLL_MS * 2);
    expect(store.state()).toBeNull(); // http.verify() proves nothing was requested
  });

  it('keeps the server clock offset, so countdowns ignore a wrong device clock', async () => {
    // This device is 90 seconds behind the server.
    await attach(sessionState({ serverTime: new Date(T0 + 90_000).toISOString() }));
    expect(store.clockOffsetMs()).toBe(90_000);
    expect(store.now()).toBe(T0 + 90_000);
    jest.advanceTimersByTime(1000);
    expect(store.now()).toBe(T0 + 91_000);
  });

  it('never replaces the state with an older version', async () => {
    await attach(sessionState({ version: 5, title: 'Newer' }));
    const pending = store.refresh();
    http.expectOne(stateUrl).flush(sessionState({ version: 4, title: 'Stale' }));
    await pending;
    expect(store.state()?.title).toBe('Newer');
    const next = store.refresh();
    http.expectOne(stateUrl).flush(sessionState({ version: 6, title: 'Newest' }));
    await next;
    expect(store.state()?.title).toBe('Newest');
  });

  it('refetches on a ping with a newer version and ignores one it already has', async () => {
    await attach(sessionState({ version: 5 }));
    store.ping({ sessionId: 'session-1', version: 5 });
    store.ping({ sessionId: 'session-1', version: 3 });
    http.expectNone(stateUrl);
    store.ping({ sessionId: 'session-1', version: 6 });
    http.expectOne(stateUrl).flush(sessionState({ version: 6 }));
    await settle();
    expect(store.state()?.version).toBe(6);
  });

  it('follows a session that starts after the learner joined', async () => {
    store.attach('room-1', null);
    store.ping({ sessionId: 'session-9', version: 1 });
    http
      .expectOne(`${api}/sessions/session-9/state`)
      .flush(sessionState({ id: 'session-9', version: 1 }));
    http.expectOne(`${api}/sessions/session-9/heartbeat`).flush(null);
    await settle();
    expect(store.sessionId()).toBe('session-9');
    expect(store.live()).toBe(true);
  });

  it('finds a new session from the classroom list when no ping arrived', async () => {
    store.attach('room-1', null);
    jest.advanceTimersByTime(DISCOVER_MS);
    http.expectOne(`${api}/classrooms`).flush([
      { id: 'other', liveSessionId: 'nope' },
      { id: 'room-1', liveSessionId: 'session-1' },
    ]);
    await settle();
    http.expectOne(stateUrl).flush(sessionState());
    http.expectOne(beatUrl).flush(null);
    await settle();
    expect(store.sessionId()).toBe('session-1');
  });

  it('polls every 5 seconds and beats every 30 while attached', async () => {
    await attach();
    jest.advanceTimersByTime(STATE_POLL_MS);
    http.expectOne(stateUrl).flush(sessionState({ version: 2 }));
    await settle();
    jest.advanceTimersByTime(HEARTBEAT_MS - STATE_POLL_MS);
    // Polls in between are skipped while one is still unanswered; answer what is open.
    http.match(stateUrl).forEach((request) => request.flush(sessionState({ version: 3 })));
    expect(http.match(beatUrl)).toHaveLength(1);
    await settle();
  });

  it('stops polling and beating once the learner leaves', async () => {
    await attach();
    store.detach();
    jest.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(store.state()).toBeNull();
    expect(store.sessionId()).toBeNull(); // http.verify() proves the timers are gone
  });

  it('stops polling a session that has ended', async () => {
    await attach(sessionState({ status: 'ended' }));
    jest.advanceTimersByTime(STATE_POLL_MS * 2);
    http.expectNone(stateUrl);
    http.expectNone(beatUrl);
  });

  it('drops a reply that arrives after the learner left', async () => {
    await attach();
    const pending = store.refresh();
    const request = http.expectOne(stateUrl);
    store.detach();
    request.flush(sessionState({ version: 9 }));
    await pending;
    expect(store.state()).toBeNull();
  });

  it('sends an answer and takes the state the server returns', async () => {
    await attach();
    const pending = store.respond('act-1', 'o2');
    expect(store.busy()).toBe(true);
    const request = http.expectOne(`${api}/activities/act-1/respond`);
    expect(request.request.body).toEqual({ optionId: 'o2' });
    request.flush(sessionState({ version: 2, title: 'After answer' }));
    expect(await pending).toBe(true);
    expect(store.busy()).toBe(false);
    expect(store.state()?.title).toBe('After answer');
  });

  it("shows the server's reason when an answer is refused", async () => {
    await attach();
    const pending = store.respond('act-1', 'o2');
    http
      .expectOne(`${api}/activities/act-1/respond`)
      .flush({ detail: 'This activity is closed.' }, { status: 409, statusText: 'Conflict' });
    expect(await pending).toBe(false);
    expect(store.error()).toBe('This activity is closed.');
    expect(store.busy()).toBe(false);
  });

  it('raises a hand and shows it before the next state arrives', async () => {
    await attach();
    const pending = store.setHand(true);
    const request = http.expectOne(`${api}/sessions/session-1/hand`);
    expect(request.request.body).toEqual({ raised: true });
    request.flush(null);
    await pending;
    expect(store.state()?.me.handRaised).toBe(true);
  });

  it('runs the host calls against the right routes', async () => {
    store.attach('room-1', null);
    const started = store.startSession({ blocks: 3 });
    const start = http.expectOne(`${api}/classrooms/room-1/sessions`);
    expect(start.request.body).toEqual({ blocks: 3 });
    start.flush(sessionState({ me: { isHost: true, handRaised: false, removed: false } }));
    expect(await started).toBe(true);
    http.expectOne(beatUrl).flush(null);
    expect(store.sessionId()).toBe('session-1');
    expect(store.isHost()).toBe(true);

    const advanced = store.advance();
    http.expectOne(`${api}/sessions/session-1/advance`).flush(sessionState({ version: 2 }));
    await advanced;

    const launched = store.launch({
      kind: 'poll',
      prompt: 'Which tell convinced you?',
      options: [{ label: 'A' }, { label: 'B' }],
      seconds: 60,
    });
    const launch = http.expectOne(`${api}/sessions/session-1/activities`);
    expect(launch.request.body.kind).toBe('poll');
    launch.flush(sessionState({ version: 3 }));
    await launched;

    const moderated = store.moderate('member-7', 'remove');
    const moderate = http.expectOne(`${api}/sessions/session-1/participants/member-7/moderate`);
    expect(moderate.request.body).toEqual({ action: 'remove' });
    moderate.flush(null);
    expect(await moderated).toBe(true);
    http.expectOne(stateUrl).flush(sessionState({ version: 4 }));

    const ended = store.end();
    http
      .expectOne(`${api}/sessions/session-1/end`)
      .flush(sessionState({ version: 5, status: 'ended' }));
    await ended;
    expect(store.live()).toBe(false);
  });
});
