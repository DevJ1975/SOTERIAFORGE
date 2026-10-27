import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import {
  ConnectionState,
  DisconnectReason,
  type RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { CLASSROOM_ROOM_FACTORY, Classroom, EngageService } from './engage.service';

const classroom: Classroom = {
  id: 'classroom-1',
  title: 'Safety skills',
  createdBy: 'teacher',
  createdAt: '2026-10-27T00:00:00Z',
  maxParticipants: 21,
};
const base = 'https://api.example.com/api/engage/classrooms';

type Publication = { track?: Track; isMuted: boolean };

/** The slice of RemoteParticipant that EngageService reads when it builds tiles. */
function remote(
  identity: string,
  name: string,
  publications: Partial<Record<Track.Source, Publication>> = {},
): RemoteParticipant {
  return {
    identity,
    name,
    getTrackPublication: (source: Track.Source) => publications[source],
  } as unknown as RemoteParticipant;
}

const track = (label: string) => ({ label }) as unknown as Track;
const live = (label: string): Publication => ({ track: track(label), isMuted: false });

describe('EngageService media state', () => {
  let service: EngageService;
  let http: HttpTestingController;
  let room: Room;
  let connect: jest.SpyInstance;
  let disconnect: jest.SpyInstance;

  beforeEach(() => {
    room = new Room();
    connect = jest.spyOn(room, 'connect').mockImplementation(async () => {
      room.state = ConnectionState.Connected;
    });
    disconnect = jest.spyOn(room, 'disconnect').mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [
        EngageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: 'https://api.example.com/' } },
        { provide: CLASSROOM_ROOM_FACTORY, useValue: () => room },
      ],
    });
    service = TestBed.inject(EngageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  async function join(canScreenShare = false): Promise<void> {
    const pending = service.join(classroom);
    http.expectOne(`${base}/classroom-1/join`).flush({
      serverUrl: 'wss://media.example.com',
      token: 'short-lived-token',
      canScreenShare,
    });
    await pending;
  }

  const addRemote = (participant: RemoteParticipant) =>
    (room.remoteParticipants as Map<string, RemoteParticipant>).set(
      participant.identity,
      participant,
    );

  describe('participant tiles', () => {
    it('labels the local tile and builds remote tiles with their camera and microphone', async () => {
      const camera = live('camera');
      const mic = live('mic');
      addRemote(
        remote('m1', 'Marcus', {
          [Track.Source.Camera]: camera,
          [Track.Source.Microphone]: mic,
        }),
      );
      await join();
      const [me, marcus] = service.tiles();
      expect(me).toMatchObject({ local: true, name: 'Class participant (you)' });
      expect(me.audio).toBeUndefined(); // never play your own microphone back
      expect(marcus).toMatchObject({ id: 'm1', name: 'Marcus', local: false });
      expect(marcus.video).toBe(camera.track);
      expect(marcus.audio).toBe(mic.track);
    });

    it('shows "camera off" for a muted or unpublished camera', async () => {
      addRemote(
        remote('m1', 'Marcus', {
          [Track.Source.Camera]: { track: track('c'), isMuted: true },
        }),
      );
      addRemote(remote('m2', 'Priya'));
      await join();
      expect(service.tiles().map((t) => t.video)).toEqual([undefined, undefined, undefined]);
    });

    it('adds a separate screen tile, with its own audio, for a sharing participant', async () => {
      const screen = live('screen');
      const screenAudio = live('screen-audio');
      addRemote(
        remote('t1', 'Teacher', {
          [Track.Source.ScreenShare]: screen,
          [Track.Source.ScreenShareAudio]: screenAudio,
        }),
      );
      await join();
      const tile = service.tiles().find((t) => t.id === 't1-screen');
      expect(tile).toMatchObject({ name: 'Teacher - screen', local: false });
      expect(tile?.video).toBe(screen.track);
      expect(tile?.audio).toBe(screenAudio.track);
    });

    it('ignores a muted screen share', async () => {
      addRemote(
        remote('t1', 'Teacher', {
          [Track.Source.ScreenShare]: { track: track('s'), isMuted: true },
        }),
      );
      await join();
      expect(service.tiles().map((t) => t.id)).not.toContain('t1-screen');
    });

    it('updates the grid as participants arrive and leave', async () => {
      await join();
      expect(service.tiles()).toHaveLength(1);
      const late = remote('m9', 'Late arrival');
      addRemote(late);
      room.emit(RoomEvent.ParticipantConnected, late);
      expect(service.tiles().map((t) => t.name)).toContain('Late arrival');
      (room.remoteParticipants as Map<string, RemoteParticipant>).delete('m9');
      room.emit(RoomEvent.ParticipantDisconnected, late);
      expect(service.tiles()).toHaveLength(1);
    });
  });

  describe('joining', () => {
    it('shows the API error and stays out of the room when credentials are refused', async () => {
      const pending = service.join(classroom);
      http
        .expectOne(`${base}/classroom-1/join`)
        .flush({ detail: 'Video classrooms are unavailable.' }, { status: 503, statusText: 'x' });
      await pending;
      expect(service.error()).toBe('Video classrooms are unavailable.');
      expect(service.state()).toBe(ConnectionState.Disconnected);
      expect(service.activeClassroom()).toBeNull();
      expect(service.busy()).toBe(false);
      expect(connect).not.toHaveBeenCalled();
    });

    it('refuses to open media on an insecure page without calling the API', async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
      Object.defineProperty(globalThis, 'isSecureContext', { value: false, configurable: true });
      try {
        await service.join(classroom);
        http.expectNone(`${base}/classroom-1/join`);
        expect(service.error()).toContain('HTTPS');
        expect(service.state()).toBe(ConnectionState.Disconnected);
      } finally {
        if (original) Object.defineProperty(globalThis, 'isSecureContext', original);
        else delete (globalThis as { isSecureContext?: boolean }).isSecureContext;
      }
    });

    it('can join again after the server drops the connection', async () => {
      await join();
      room.emit(RoomEvent.Disconnected, DisconnectReason.SERVER_SHUTDOWN);
      expect(service.activeClassroom()).toBeNull();
      await join();
      expect(service.state()).toBe(ConnectionState.Connected);
      expect(service.activeClassroom()).toEqual(classroom);
    });

    it('stops reacting to room events after leaving', async () => {
      await join();
      await service.leave();
      expect(room.listenerCount(RoomEvent.TrackSubscribed)).toBe(0);
      const late = remote('x', 'Ghost');
      addRemote(late);
      room.emit(RoomEvent.ParticipantConnected, late);
      expect(service.tiles()).toEqual([]);
    });

    it('does nothing after the component is destroyed', async () => {
      service.ngOnDestroy();
      await service.join(classroom);
      http.expectNone(`${base}/classroom-1/join`);
      const pending = service.load();
      http.expectOne(base).flush([classroom]);
      await pending;
      expect(service.classrooms()).toEqual([]);
    });
  });

  describe('controls', () => {
    it('ignores toggles when not in a room', async () => {
      await service.toggle('microphone');
      expect(service.error()).toBe('');
      expect(service.busy()).toBe(false);
    });

    it('enables the microphone, then mutes it, using the participant state', async () => {
      const set = jest
        .spyOn(room.localParticipant, 'setMicrophoneEnabled')
        .mockResolvedValue(undefined);
      const enabled = jest.spyOn(room.localParticipant, 'isMicrophoneEnabled', 'get');
      await join();
      enabled.mockReturnValue(false);
      await service.toggle('microphone');
      expect(set).toHaveBeenLastCalledWith(true);
      enabled.mockReturnValue(true);
      await service.toggle('microphone');
      expect(set).toHaveBeenLastCalledWith(false);
      expect(service.microphoneEnabled()).toBe(true); // mirrors the (mocked) participant
    });

    it('toggles the camera', async () => {
      const set = jest
        .spyOn(room.localParticipant, 'setCameraEnabled')
        .mockResolvedValue(undefined);
      await join();
      await service.toggle('camera');
      expect(set).toHaveBeenCalledWith(true);
    });

    it('ignores a second toggle while the first is still running', async () => {
      let finish: () => void = () => undefined;
      const set = jest.spyOn(room.localParticipant, 'setCameraEnabled').mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(undefined);
          }),
      );
      await join();
      const first = service.toggle('camera');
      await service.toggle('camera');
      expect(set).toHaveBeenCalledTimes(1);
      finish();
      await first;
      expect(service.busy()).toBe(false);
    });

    it('reports a disconnect failure on leave and still clears the classroom', async () => {
      await join();
      disconnect.mockRejectedValueOnce(new Error('socket closed'));
      await service.leave();
      expect(service.error()).toContain('Could not cleanly disconnect');
      expect(service.error()).toContain('socket closed');
      expect(service.activeClassroom()).toBeNull();
    });

    it('reports when Chrome refuses to start classroom audio', async () => {
      jest.spyOn(room, 'startAudio').mockRejectedValue(new Error('gesture required'));
      await join();
      await service.startAudio();
      expect(service.error()).toContain('Could not enable classroom audio');
    });

    it('asks for a click while autoplay is blocked, and stops asking once audio plays', async () => {
      const playable = jest.spyOn(room, 'canPlaybackAudio', 'get').mockReturnValue(false);
      await join();
      expect(service.needsAudioStart()).toBe(true);
      playable.mockReturnValue(true);
      room.emit(RoomEvent.AudioPlaybackStatusChanged, true);
      expect(service.needsAudioStart()).toBe(false);
    });
  });

  describe('why a participant was disconnected', () => {
    async function dropWith(reason: DisconnectReason | undefined): Promise<string> {
      await join();
      room.emit(RoomEvent.Disconnected, reason);
      return service.error();
    }

    it('explains a second tab or device taking over the same identity', async () => {
      // Tokens use the member id as identity, so joining twice kicks the first session.
      const message = await dropWith(DisconnectReason.DUPLICATE_IDENTITY);
      expect(message).toMatch(/another tab or device/i);
      expect(message).not.toMatch(/reason \d/);
    });

    it('says when the participant was removed from the classroom', async () => {
      expect(await dropWith(DisconnectReason.PARTICIPANT_REMOVED)).toMatch(/removed/i);
    });

    it.each([DisconnectReason.ROOM_DELETED, DisconnectReason.ROOM_CLOSED])(
      'says when the classroom was closed (%s)',
      async (reason) => {
        expect(await dropWith(reason)).toMatch(/closed/i);
      },
    );

    it('says the media server is restarting and that rejoining is fine', async () => {
      expect(await dropWith(DisconnectReason.SERVER_SHUTDOWN)).toMatch(/try joining again/i);
    });

    it('keeps the numeric reason for anything else, to help support', async () => {
      expect(await dropWith(DisconnectReason.MEDIA_FAILURE)).toContain(
        `reason ${DisconnectReason.MEDIA_FAILURE}`,
      );
    });

    it('still reports a disconnect with no reason', async () => {
      expect(await dropWith(undefined)).toBe('Disconnected from the classroom.');
    });
  });
});

describe('EngageService without an API', () => {
  it('explains that the Forge API must be configured instead of failing silently', async () => {
    TestBed.configureTestingModule({
      providers: [
        EngageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: {} },
      ],
    });
    const service = TestBed.inject(EngageService);
    await service.load();
    expect(service.error()).toBe(
      'Could not load classrooms. Configure the Forge API to use video classrooms.',
    );
    await service.create('Safety');
    expect(service.error()).toContain('Configure the Forge API');
    TestBed.resetTestingModule();
  });
});
