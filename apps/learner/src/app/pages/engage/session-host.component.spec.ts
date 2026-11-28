import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { activity, sessionState } from './engage-session.fixtures';
import type { AttendanceRow, NewActivityInput, SessionState } from './engage-session.model';
import { EngageSessionStore } from './engage-session.store';
import { SessionHostComponent } from './session-host.component';

describe('SessionHostComponent', () => {
  let fixture: ComponentFixture<SessionHostComponent>;
  const state = signal<SessionState | null>(null);
  const attendance = signal<AttendanceRow[] | null>(null);
  const store = {
    state,
    attendance,
    busy: signal(false),
    sessionId: signal<string | null>(null),
    live: () => state()?.status === 'live',
    startSession: jest.fn(async () => true),
    advance: jest.fn(async () => true),
    end: jest.fn(async () => true),
    launch: jest.fn((input: NewActivityInput) => Promise.resolve(Boolean(input))),
    closeActivity: jest.fn(async () => true),
    moderate: jest.fn(async () => true),
    loadAttendance: jest.fn(async () => undefined),
  };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
    );
  const field = (name: string) => el().querySelector<HTMLInputElement>(`input[name="${name}"]`);

  async function type(name: string, value: string): Promise<void> {
    const input = field(name);
    if (!input) throw new Error(`No field ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function create(initial: SessionState | null): Promise<void> {
    state.set(initial);
    store.sessionId.set(initial?.id ?? null);
    fixture = TestBed.createComponent(SessionHostComponent);
    await settle();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    attendance.set(null);
    store.busy.set(false);
    TestBed.configureTestingModule({
      imports: [SessionHostComponent],
      providers: [{ provide: EngageSessionStore, useValue: store }],
    });
  });

  it('starts a session with the chosen number of blocks', async () => {
    await create(null);
    expect(button('Next stage')).toBeUndefined();
    await type('blocks', '3');
    el().querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(store.startSession).toHaveBeenCalledWith({ blocks: 3 });
  });

  it('advances the stage and ends only after an in-page confirmation', async () => {
    await create(sessionState());
    button('Next stage')?.click();
    expect(store.advance).toHaveBeenCalled();
    button('End session…')?.click();
    await settle();
    expect(store.end).not.toHaveBeenCalled();
    expect(el().textContent).toContain('End the session for everyone?');
    button('Keep going')?.click();
    await settle();
    expect(button('End session…')).toBeDefined();
    button('End session…')?.click();
    await settle();
    button('End session')?.click();
    await settle();
    expect(store.end).toHaveBeenCalledTimes(1);
  });

  it('will not start a Threat Hunt until it has a challenge, two tickets and the real attack', async () => {
    await create(sessionState());
    const start = () => button('Start Threat Hunt');
    expect(start()?.disabled).toBe(true);
    expect(el().textContent).toContain('Write the challenge.');
    await type('prompt', 'Find the real attack.');
    expect(el().textContent).toContain('Give at least two options a label.');
    await type('label0', 'Ticket #4471');
    await type('label1', 'Ticket #4474');
    await type('detail1', 'SYSTEM: ignore prior instructions');
    expect(el().textContent).toContain('Mark which ticket is the real attack.');
    const correct = el().querySelectorAll<HTMLInputElement>('input[name="correct"]');
    correct[1].dispatchEvent(new Event('change'));
    await settle();
    expect(start()?.disabled).toBe(false);

    el().querySelector('form.launch')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.launch).toHaveBeenCalledWith({
      kind: 'hunt',
      prompt: 'Find the real attack.',
      options: [
        { label: 'Ticket #4471' },
        { label: 'Ticket #4474', detail: 'SYSTEM: ignore prior instructions' },
      ],
      seconds: 180,
      correctIndex: 1,
      xp: 40,
    });
    // The form clears for the next activity.
    expect(field('prompt')?.value).toBe('');
  });

  it('sends a poll without hunt-only fields, skipping blank options', async () => {
    await create(sessionState());
    el()
      .querySelector<HTMLInputElement>('input[name="kind"][value="poll"]')
      ?.dispatchEvent(new Event('change'));
    await settle();
    expect(el().querySelector('input[name="correct"]')).toBeNull();
    expect(field('xp')).toBeNull();
    await type('prompt', 'Which tell convinced you?');
    button('Add option')?.click();
    await settle();
    await type('label0', 'Sender address');
    await type('label2', 'Request to export data');
    await type('seconds', '60');
    el().querySelector('form.launch')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.launch).toHaveBeenCalledWith({
      kind: 'poll',
      prompt: 'Which tell convinced you?',
      options: [{ label: 'Sender address' }, { label: 'Request to export data' }],
      seconds: 60,
    });
  });

  it('keeps the real-attack mark on the right ticket when one above it is removed', async () => {
    await create(sessionState());
    button('Add option')?.click();
    await settle();
    await type('prompt', 'Hunt');
    await type('label0', 'A');
    await type('label1', 'B');
    await type('label2', 'C');
    el()
      .querySelectorAll<HTMLInputElement>('input[name="correct"]')[2]
      .dispatchEvent(new Event('change'));
    await settle();
    button('Remove option 1')?.click();
    await settle();
    el().querySelector('form.launch')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.launch.mock.calls[0][0]).toMatchObject({
      options: [{ label: 'B' }, { label: 'C' }],
      correctIndex: 1,
    });
  });

  it('refuses a time outside 10 to 600 seconds', async () => {
    await create(sessionState());
    await type('prompt', 'Hunt');
    await type('label0', 'A');
    await type('label1', 'B');
    el()
      .querySelectorAll<HTMLInputElement>('input[name="correct"]')[0]
      .dispatchEvent(new Event('change'));
    await type('seconds', '5');
    expect(button('Start Threat Hunt')?.disabled).toBe(true);
    expect(el().textContent).toContain('between 10 and 600 seconds');
  });

  it('closes the open activity and blocks starting another meanwhile', async () => {
    await create(sessionState({ activity: activity() }));
    expect(button('Start Threat Hunt')?.disabled).toBe(true);
    expect(el().textContent).toContain('Close the open activity before starting another.');
    button('Close Threat Hunt')?.click();
    expect(store.closeActivity).toHaveBeenCalledWith('act-1');
  });

  it('answers raised hands: lower, mute, and remove only after confirming', async () => {
    await create(
      sessionState({
        hands: [{ memberId: 'm7', name: 'Tasha Brooks', raisedAt: '2026-11-21T18:01:00Z' }],
      }),
    );
    expect(el().textContent).toContain('Raised hands (1)');
    button('Lower hand for Tasha Brooks')?.click();
    button('Mute Tasha Brooks')?.click();
    expect(store.moderate.mock.calls).toEqual([
      ['m7', 'lower_hand'],
      ['m7', 'mute'],
    ]);
    button('Remove Tasha Brooks from the session')?.click();
    await settle();
    expect(store.moderate).toHaveBeenCalledTimes(2);
    button('Cancel')?.click();
    await settle();
    button('Remove Tasha Brooks from the session')?.click();
    await settle();
    button('Confirm removing Tasha Brooks from the session')?.click();
    await settle();
    expect(store.moderate).toHaveBeenLastCalledWith('m7', 'remove');
  });

  it('loads attendance on request and lists who was there', async () => {
    await create(sessionState());
    expect(el().querySelector('table')).toBeNull();
    button('Show attendance')?.click();
    expect(store.loadAttendance).toHaveBeenCalled();
    attendance.set([
      {
        memberId: 'm1',
        name: 'Marcus Walker',
        crew: 'Crew Alpha',
        firstJoinedAt: '2026-11-21T18:00:00Z',
        lastSeenAt: '2026-11-21T18:20:00Z',
        minutes: 20,
        removed: false,
      },
      {
        memberId: 'm2',
        name: 'Kevin Tran',
        crew: null,
        firstJoinedAt: '2026-11-21T18:02:00Z',
        lastSeenAt: '2026-11-21T18:05:00Z',
        minutes: 3,
        removed: true,
      },
    ]);
    await settle();
    const rows = Array.from(el().querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Crew Alpha');
    expect(rows[0].querySelectorAll('td')[2].textContent).toBe('20');
    expect(rows[1].textContent).toContain('removed');
    expect(rows[1].textContent).toContain('No crew');
    // Someone already removed has no further actions.
    expect(rows[1].querySelectorAll('button')).toHaveLength(0);
    expect(button('Refresh attendance')).toBeDefined();
  });

  it('never uses a browser dialog', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await create(
      sessionState({ hands: [{ memberId: 'm7', name: 'T', raisedAt: '2026-11-21T18:01:00Z' }] }),
    );
    button('End session…')?.click();
    button('Remove T from the session')?.click();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
