import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, ForgeSession } from '@assurance/auth';
import { ConnectionState } from 'livekit-client';
import { EngageComponent } from './engage.component';
import { Classroom, EngageService } from './engage.service';

const api = 'https://api.example.com/api/engage/classrooms';
const room: Classroom = {
  id: 'room-1',
  title: 'Safety skills',
  createdBy: 'teacher',
  createdAt: '2026-10-27T00:00:00Z',
  maxParticipants: 21,
};

describe('EngageComponent classroom controls', () => {
  const canAuthor = signal(false);
  let http: HttpTestingController;
  let fixture: ComponentFixture<EngageComponent>;
  let service: EngageService;

  async function create(rooms: Classroom[] = []): Promise<void> {
    fixture = TestBed.createComponent(EngageComponent);
    fixture.detectChanges();
    http.expectOne(api).flush(rooms);
    await fixture.whenStable();
    service = fixture.debugElement.injector.get(EngageService);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes(text));

  function enterRoom(state = ConnectionState.Connected): void {
    service.activeClassroom.set(room);
    service.state.set(state);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    canAuthor.set(false);
    await TestBed.configureTestingModule({
      imports: [EngageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'https://api.example.com' } },
        { provide: ForgeSession, useValue: { canAuthor } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it('starts with the microphone and camera off and offers to turn them on', async () => {
    await create();
    enterRoom();
    expect(el().querySelector('h2')?.textContent).toContain('Safety skills');
    expect(button('Enable microphone')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('Enable camera')?.getAttribute('aria-pressed')).toBe('false');
    expect(el().textContent).toContain('camera and microphone are off when you join');
  });

  it('reflects live device state in the button labels and pressed state', async () => {
    await create();
    enterRoom();
    service.microphoneEnabled.set(true);
    service.cameraEnabled.set(true);
    fixture.detectChanges();
    expect(button('Mute microphone')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('Turn camera off')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('disables device buttons until the connection is up, but always allows leaving', async () => {
    await create();
    enterRoom(ConnectionState.Connecting);
    expect(button('Enable microphone')?.disabled).toBe(true);
    expect(button('Enable camera')?.disabled).toBe(true);
    expect(button('Leave classroom')?.disabled).toBe(false);
    service.state.set(ConnectionState.Connected);
    fixture.detectChanges();
    expect(button('Enable microphone')?.disabled).toBe(false);
  });

  it('disables device buttons while another media change is in flight', async () => {
    await create();
    enterRoom();
    service.busy.set(true);
    fixture.detectChanges();
    expect(button('Enable camera')?.disabled).toBe(true);
  });

  it('routes button clicks to the service', async () => {
    await create();
    enterRoom();
    const toggle = jest.spyOn(service, 'toggle').mockResolvedValue();
    const leave = jest.spyOn(service, 'leave').mockResolvedValue();
    button('Enable microphone')?.click();
    button('Enable camera')?.click();
    button('Leave classroom')?.click();
    expect(toggle).toHaveBeenNthCalledWith(1, 'microphone');
    expect(toggle).toHaveBeenNthCalledWith(2, 'camera');
    expect(leave).toHaveBeenCalledTimes(1);
  });

  describe('screen sharing', () => {
    it('is hidden from learners', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getDisplayMedia: jest.fn() },
        configurable: true,
      });
      await create();
      enterRoom();
      expect(button('Share screen')).toBeUndefined();
    });

    it('is offered to staff in a browser that can capture the screen', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getDisplayMedia: jest.fn() },
        configurable: true,
      });
      await create();
      enterRoom();
      service.canScreenShare.set(true);
      fixture.detectChanges();
      expect(button('Share screen')).toBeDefined();
      service.screenShareEnabled.set(true);
      fixture.detectChanges();
      expect(button('Stop sharing')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('explains why staff cannot share in an unsupported browser', async () => {
      await create();
      enterRoom();
      service.canScreenShare.set(true);
      fixture.detectChanges();
      expect(button('Share screen')).toBeUndefined();
      expect(el().textContent).toContain('Screen sharing is unavailable in this browser');
    });
  });

  describe('audio autoplay', () => {
    it('shows a button that starts classroom audio only while Chrome blocks it', async () => {
      await create();
      enterRoom();
      expect(button('Enable classroom audio')).toBeUndefined();
      service.needsAudioStart.set(true);
      fixture.detectChanges();
      const start = jest.spyOn(service, 'startAudio').mockResolvedValue();
      button('Enable classroom audio')?.click();
      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  describe('participant grid', () => {
    it('names every tile and says when a camera is off', async () => {
      await create();
      enterRoom();
      service.tiles.set([
        { id: 'me', name: 'Class participant (you)', local: true },
        { id: 'm1', name: 'Marcus', local: false },
      ]);
      fixture.detectChanges();
      const tiles = Array.from(el().querySelectorAll('article.tile'));
      expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
        'Class participant (you)',
        'Marcus',
      ]);
      expect(tiles.every((t) => t.textContent?.includes('Camera off'))).toBe(true);
    });
  });

  describe('classroom list', () => {
    it('lets a learner join, and blocks a second join while connecting', async () => {
      await create([room]);
      const join = jest.spyOn(service, 'join').mockResolvedValue();
      button('Join Safety skills')?.click();
      expect(join).toHaveBeenCalledWith(room);
      service.busy.set(true);
      fixture.detectChanges();
      expect(button('Join Safety skills')?.disabled).toBe(true);
    });

    it('offers to cancel while credentials are being fetched', async () => {
      await create([room]);
      service.state.set(ConnectionState.Connecting);
      fixture.detectChanges();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Connecting');
      const leave = jest.spyOn(service, 'leave').mockResolvedValue();
      button('Cancel connection')?.click();
      expect(leave).toHaveBeenCalled();
    });

    it('refreshes the list on request', async () => {
      await create();
      button('Refresh classrooms')?.click();
      http.expectOne(api).flush([room]);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().textContent).toContain('Join Safety skills');
    });
  });

  describe('creating a classroom', () => {
    async function type(title: string): Promise<void> {
      const input = el().querySelector<HTMLInputElement>('#classroom-title');
      if (!input) throw new Error('create form is missing');
      input.value = title;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
    }
    /** Let async handlers finish, render, then let ngModel write back to the input. */
    async function settle(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const submit = () => el().querySelector<HTMLButtonElement>('button[type="submit"]');

    beforeEach(() => canAuthor.set(true));

    it('keeps Create disabled until there is a non-blank title', async () => {
      await create();
      expect(submit()?.disabled).toBe(true);
      await type('   ');
      expect(submit()?.disabled).toBe(true);
      await type('Safety skills');
      expect(submit()?.disabled).toBe(false);
    });

    it('sends the trimmed title, then clears the form and lists the new room', async () => {
      await create();
      await type(' Safety skills ');
      el().querySelector('form')?.dispatchEvent(new Event('submit'));
      const request = http.expectOne(api);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ title: 'Safety skills' });
      request.flush(room);
      await fixture.whenStable();
      fixture.detectChanges();
      await settle();
      expect(el().querySelector<HTMLInputElement>('#classroom-title')?.value).toBe('');
      expect(el().textContent).toContain('Join Safety skills');
    });

    it('keeps what was typed and shows an alert when creation fails', async () => {
      await create();
      await type('Safety skills');
      el().querySelector('form')?.dispatchEvent(new Event('submit'));
      http
        .expectOne(api)
        .flush({ detail: 'Video classrooms are unavailable.' }, { status: 503, statusText: 'x' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('unavailable');
      expect(el().querySelector<HTMLInputElement>('#classroom-title')?.value).toBe('Safety skills');
    });
  });
});
