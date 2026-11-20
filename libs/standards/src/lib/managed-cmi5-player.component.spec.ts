import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AU_POLL_MS, ManagedCmi5PlayerComponent } from './managed-cmi5-player.component';
import { StandardsApi, type AuSession } from './standards-api';

describe('ManagedCmi5PlayerComponent', () => {
  let fixture: ComponentFixture<ManagedCmi5PlayerComponent>;
  const launch = {
    id: 'session-1',
    auUrl: 'https://games.example.test/sim/index.html',
    endpoint: 'https://api.example.test/api/standards/xapi/',
    fetch: 'https://api.example.test/api/standards/cmi5/fetch/session-1/secret',
    actor: '{"objectType":"Agent","account":{"homePage":"https://x.test","name":"m1"}}',
    registration: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    activityId: 'https://x.test/lessons/lesson-1',
    expiresAt: '2099-01-01T00:00:00Z',
  };
  const session = (over: Partial<AuSession> = {}): AuSession => ({
    id: 'session-1',
    active: true,
    initialized: true,
    completed: false,
    success: null,
    terminated: false,
    score: null,
    completion: null,
    ...over,
  });
  const completion = { progressPct: 50, completed: false, firstCompletion: true, award: null };
  const api = { cmi5Launch: jest.fn(), cmi5Session: jest.fn() };
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    api.cmi5Launch.mockResolvedValue(launch);
    api.cmi5Session.mockResolvedValue(session());
    await TestBed.configureTestingModule({
      imports: [ManagedCmi5PlayerComponent],
      providers: [{ provide: StandardsApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(ManagedCmi5PlayerComponent);
    fixture.componentRef.setInput('lessonId', 'lesson-1');
    fixture.detectChanges();
  });

  afterEach(() => jest.useRealTimers());

  async function open(): Promise<void> {
    el().querySelector('button')!.click();
    await jest.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function tick(): Promise<void> {
    await jest.advanceTimersByTimeAsync(AU_POLL_MS);
    fixture.detectChanges();
  }

  it('launches the content with the cmi5 parameters from the API', async () => {
    await open();
    expect(api.cmi5Launch).toHaveBeenCalledWith('lesson-1');
    const src = new URL(el().querySelector('iframe')!.src);
    expect(src.origin + src.pathname).toBe(launch.auUrl);
    expect(src.searchParams.get('endpoint')).toBe(launch.endpoint);
    expect(src.searchParams.get('fetch')).toBe(launch.fetch);
    expect(src.searchParams.get('registration')).toBe(launch.registration);
    expect(src.searchParams.get('activityId')).toBe(launch.activityId);
  });

  it('refuses content on the app origin', async () => {
    api.cmi5Launch.mockResolvedValue({ ...launch, auUrl: `${window.location.origin}/sim/` });
    await open();
    expect(el().querySelector('iframe')).toBeNull();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('invalid content launch');
  });

  it('reports a completion once, again when it changes, and stops when the session ends', async () => {
    const emitted: unknown[] = [];
    fixture.componentInstance.completed.subscribe((c) => emitted.push(c));
    await open();
    await tick();
    expect(emitted).toEqual([]);

    api.cmi5Session.mockResolvedValue(session({ completed: true, completion }));
    await tick();
    await tick();
    expect(emitted).toEqual([completion]);
    expect(el().textContent).toContain('Lesson complete');

    const scored = { ...completion, firstCompletion: false };
    api.cmi5Session.mockResolvedValue(
      session({ completed: true, terminated: true, active: false, completion: scored }),
    );
    await tick();
    expect(emitted).toEqual([completion, scored]);

    const calls = api.cmi5Session.mock.calls.length;
    await tick();
    expect(api.cmi5Session.mock.calls.length).toBe(calls);
  });

  it('keeps polling after a failed poll and stops when destroyed', async () => {
    await open();
    api.cmi5Session.mockRejectedValueOnce(new Error('offline'));
    await tick();
    await tick();
    expect(api.cmi5Session).toHaveBeenCalledTimes(2);
    fixture.destroy();
    await jest.advanceTimersByTimeAsync(AU_POLL_MS * 3);
    expect(api.cmi5Session).toHaveBeenCalledTimes(2);
  });
});
