import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, ForgeSession } from '@assurance/auth';
import { GamificationAdminApi } from '@assurance/lms-core';
import { ConnectionState } from 'livekit-client';
import { activity, sessionState } from './engage-session.fixtures';
import type { SessionState } from './engage-session.model';
import { EngageSessionStore } from './engage-session.store';
import { EngageComponent } from './engage.component';
import { type Classroom, type ClassroomTile, EngageService } from './engage.service';

const api = 'https://api.example.com/api/engage';
const room: Classroom = {
  id: 'room-1',
  title: 'Week 5 lab day',
  createdBy: 'teacher',
  createdAt: '2026-11-21T00:00:00Z',
  maxParticipants: 21,
};

const tile = (id: string, over: Partial<ClassroomTile> = {}): ClassroomTile => ({
  id,
  participantId: id,
  name: `Person ${id}`,
  local: false,
  staff: false,
  screen: false,
  ...over,
});

describe('EngageComponent live session', () => {
  const canAuthor = signal(false);
  const cohorts = jest.fn();
  let http: HttpTestingController;
  let fixture: ComponentFixture<EngageComponent>;
  let service: EngageService;
  let store: EngageSessionStore;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const names = () =>
    Array.from(el().querySelectorAll('article.tile')).map((t) => t.getAttribute('aria-label'));

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function create(rooms: Classroom[] = [room]): Promise<void> {
    fixture = TestBed.createComponent(EngageComponent);
    fixture.detectChanges();
    http.expectOne(`${api}/classrooms`).flush(rooms);
    await fixture.whenStable();
    service = fixture.debugElement.injector.get(EngageService);
    store = fixture.debugElement.injector.get(EngageSessionStore);
    fixture.detectChanges();
  }

  /** Put the learner in the room with a live session whose first state is `state`. */
  async function enter(state: SessionState, tiles: ClassroomTile[] = []): Promise<void> {
    service.sessionId.set(state.id);
    service.tiles.set(tiles);
    service.activeClassroom.set(room);
    service.state.set(ConnectionState.Connected);
    fixture.detectChanges();
    http.expectOne(`${api}/sessions/${state.id}/state`).flush(state);
    http.expectOne(`${api}/sessions/${state.id}/heartbeat`).flush(null);
    await settle();
  }

  beforeEach(async () => {
    canAuthor.set(false);
    cohorts.mockReset();
    await TestBed.configureTestingModule({
      imports: [EngageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'https://api.example.com' } },
        { provide: ForgeSession, useValue: { canAuthor } },
        { provide: GamificationAdminApi, useValue: { cohorts } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('shows the block bar, the open hunt and my crew once a session is live', async () => {
    await create();
    await enter(
      sessionState({
        activity: activity(),
        crew: {
          id: 'c1',
          name: 'Crew Alpha',
          rank: 2,
          crewCount: 4,
          total: 3000,
          members: [{ memberId: 'me', name: 'Marcus', isLead: true, points: 680, isMe: true }],
        },
      }),
    );
    expect(el().textContent).toContain('Block 2 of 4');
    expect(el().textContent).toContain('Threat Hunt');
    expect(el().textContent).toContain('#2 of 4 crews');
    expect(el().querySelector('.live')?.textContent).toBe('Live');
    // Learners get no host tools.
    expect(el().querySelector('assurance-session-host')).toBeNull();
  });

  it('pages six tiles at a time: hosts first, then my crew, then the rest', async () => {
    await create();
    const tiles = [
      tile('a'),
      tile('b'),
      tile('crew-1'),
      tile('c'),
      tile('host', { staff: true }),
      tile('d'),
      tile('crew-2'),
      tile('e'),
    ];
    await enter(sessionState({ crewMemberIds: ['crew-1', 'crew-2'] }), tiles);
    expect(names()).toEqual([
      'Person host',
      'Person crew-1',
      'Person crew-2',
      'Person a',
      'Person b',
      'Person c',
    ]);
    expect(el().querySelector('nav.pager')?.textContent).toContain('Page 1 of 2');
    expect(button('Previous page')?.disabled).toBe(true);
    button('Next page')?.click();
    await settle();
    expect(names()).toEqual(['Person d', 'Person e']);
    expect(button('Next page')?.disabled).toBe(true);
    expect(el().querySelector('nav.pager')?.textContent).toContain('Page 2 of 2');
  });

  it('marks who is speaking without moving any tile', async () => {
    await create();
    await enter(sessionState(), [tile('a'), tile('b'), tile('c')]);
    const before = names();
    service.speakingIds.set(new Set(['c']));
    await settle();
    expect(names()).toEqual(before);
    const speaking = el().querySelectorAll('article.tile')[2];
    expect(speaking.classList.contains('is-speaking')).toBe(true);
    expect(speaking.textContent).toContain('Speaking');
  });

  it('falls back a page when the people on the last one leave', async () => {
    await create();
    const tiles = Array.from({ length: 7 }, (_, i) => tile(`p${i}`));
    await enter(sessionState(), tiles);
    button('Next page')?.click();
    await settle();
    expect(names()).toEqual(['Person p6']);
    service.tiles.set(tiles.slice(0, 6));
    await settle();
    expect(names()).toHaveLength(6);
    expect(el().querySelector('nav.pager')).toBeNull();
  });

  it('raises and lowers a hand from the control bar', async () => {
    await create();
    await enter(sessionState());
    const raise = button('Raise hand');
    expect(raise?.getAttribute('aria-pressed')).toBe('false');
    raise?.click();
    const request = http.expectOne(`${api}/sessions/session-1/hand`);
    expect(request.request.body).toEqual({ raised: true });
    request.flush(null);
    await settle();
    expect(button('Lower hand')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('sends a hunt answer through the store', async () => {
    await create();
    await enter(sessionState({ activity: activity() }));
    el()
      .querySelectorAll<HTMLInputElement>('assurance-session-activity input[type="radio"]')[1]
      .dispatchEvent(new Event('change'));
    await settle();
    button('Submit answer')?.click();
    const request = http.expectOne(`${api}/activities/act-1/respond`);
    expect(request.request.body).toEqual({ optionId: 'o2' });
    request.flush(
      sessionState({
        version: 2,
        activity: activity({
          myResponse: { optionId: 'o2', answeredAt: '2026-11-21T18:00:38Z', elapsedMs: 38_000 },
          myResult: { correct: true, crewRank: 1, classRank: 2, xp: 40 },
        }),
      }),
    );
    await settle();
    expect(el().textContent).toContain('1st in crew · 2nd in class · +40 XP');
  });

  it('shows crew notes in the huddle stage only', async () => {
    await create();
    const huddle = { text: 'Notes', updatedAt: null, updatedByName: null, canEdit: true };
    await enter(sessionState({ huddle }));
    expect(el().querySelector('assurance-session-huddle')).toBeNull();
    store.ping({ sessionId: 'session-1', version: 2 });
    http
      .expectOne(`${api}/sessions/session-1/state`)
      .flush(
        sessionState({ version: 2, huddle, block: { ...sessionState().block, stageIndex: 2 } }),
      );
    await settle();
    expect(el().querySelector('assurance-session-huddle')).not.toBeNull();
  });

  it('loads the heat map when the debrief stage starts', async () => {
    await create();
    await enter(sessionState({ block: { ...sessionState().block, stageIndex: 4 } }));
    http.expectOne(`${api}/sessions/session-1/heatmap`).flush({
      activities: [{ id: 'a1', kind: 'hunt', prompt: 'Find it', block: 1 }],
      crews: [
        {
          crewId: 'c1',
          name: 'Crew Alpha',
          cells: [{ activityId: 'a1', members: 5, responded: 5, correct: 4, rate: 0.8 }],
        },
      ],
    });
    await settle();
    expect(el().querySelector('assurance-session-heatmap table')).not.toBeNull();
    expect(el().textContent).toContain('80%');
  });

  it('follows a session announced by the server after joining', async () => {
    await create();
    service.activeClassroom.set(room);
    service.state.set(ConnectionState.Connected);
    await settle();
    expect(button('Raise hand')).toBeUndefined();
    service.sessionPing.set({ sessionId: 'session-1', version: 1 });
    fixture.detectChanges();
    http.expectOne(`${api}/sessions/session-1/state`).flush(sessionState());
    http.expectOne(`${api}/sessions/session-1/heartbeat`).flush(null);
    await settle();
    expect(el().textContent).toContain('Block 2 of 4');
    expect(button('Raise hand')).toBeDefined();
  });

  it('leaves the room and says why when the host removes the learner', async () => {
    await create();
    const leave = jest.spyOn(service, 'leave');
    await enter(sessionState({ me: { isHost: false, handRaised: false, removed: true } }));
    expect(leave).toHaveBeenCalled();
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'The host removed you from this session.',
    );
    expect(store.sessionId()).toBeNull();
  });

  it('stops following the session when the learner leaves', async () => {
    await create();
    await enter(sessionState());
    button('Leave classroom')?.click();
    await settle();
    expect(store.state()).toBeNull();
    expect(el().textContent).toContain('Join Week 5 lab day');
  });

  it('gives instructors the host tools, before and during a session', async () => {
    canAuthor.set(true);
    await create();
    service.activeClassroom.set(room);
    service.state.set(ConnectionState.Connected);
    await settle();
    expect(button('Start session')).toBeDefined();
    button('Start session')?.click();
    const request = http.expectOne(`${api}/classrooms/room-1/sessions`);
    expect(request.request.body).toEqual({ blocks: 4 });
    request.flush(sessionState({ me: { isHost: true, handRaised: false, removed: false } }));
    await settle();
    http.expectOne(`${api}/sessions/session-1/heartbeat`).flush(null);
    expect(button('Next stage')).toBeDefined();
  });

  it('lists the cohort and a Live marker on each classroom', async () => {
    await create([
      { ...room, cohortId: 'co1', cohortName: 'Cohort 1', liveSessionId: 'session-1' },
      { ...room, id: 'room-2', title: 'Open room' },
    ]);
    const items = Array.from(el().querySelectorAll('.rooms li'));
    expect(items[0].textContent).toContain('Cohort 1 cohort');
    expect(items[0].querySelector('.live')?.textContent).toBe('Live');
    expect(items[1].textContent).toContain('Everyone in this organization');
    expect(items[1].querySelector('.live')).toBeNull();
  });

  it('lets staff limit a new classroom to a cohort', async () => {
    canAuthor.set(true);
    cohorts.mockResolvedValue([{ id: 'co1', name: 'Cohort 1', startsOn: null, endsOn: null }]);
    await create([]);
    expect(el().querySelector('#classroom-cohort')).toBeNull();
    button('Limit to a cohort…')?.click();
    await settle();
    const select = el().querySelector<HTMLSelectElement>('#classroom-cohort');
    expect(Array.from(select?.options ?? []).map((o) => o.textContent?.trim())).toEqual([
      'Everyone in this organization',
      'Cohort 1 only',
    ]);
    if (!select) throw new Error('no cohort select');
    select.value = 'co1';
    select.dispatchEvent(new Event('change'));
    const title = el().querySelector<HTMLInputElement>('#classroom-title');
    if (!title) throw new Error('no title');
    title.value = 'Cohort room';
    title.dispatchEvent(new Event('input'));
    await settle();
    el().querySelector('form')?.dispatchEvent(new Event('submit'));
    const request = http.expectOne(`${api}/classrooms`);
    expect(request.request.body).toEqual({ title: 'Cohort room', cohortId: 'co1' });
    request.flush({ ...room, id: 'room-3', title: 'Cohort room', cohortName: 'Cohort 1' });
    await settle();
  });

  it('says so when cohorts cannot be loaded', async () => {
    canAuthor.set(true);
    cohorts.mockImplementation(async () => {
      throw new Error('offline');
    });
    await create([]);
    button('Limit to a cohort…')?.click();
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Cohorts could not be loaded',
    );
  });
});
