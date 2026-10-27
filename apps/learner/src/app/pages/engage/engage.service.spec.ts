import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV } from '@assurance/auth';
import { ConnectionState, Room, RoomEvent, ScreenSharePresets } from 'livekit-client';
import { CLASSROOM_ROOM_FACTORY, Classroom, EngageService } from './engage.service';

const classroom: Classroom = {
  id: 'classroom-1',
  title: 'Safety skills',
  createdBy: 'teacher',
  createdAt: '2026-10-27T00:00:00Z',
  maxParticipants: 21,
};
const base = 'https://api.example.com/api/engage/classrooms';

describe('EngageService', () => {
  let service: EngageService;
  let http: HttpTestingController;
  let room: Room;
  let connect: jest.SpyInstance;
  let disconnect: jest.SpyInstance;

  beforeEach(() => {
    room = new Room();
    connect = jest.spyOn(room, 'connect').mockImplementation(async () => {
      room.state = ConnectionState.Connected;
      room.localParticipant.identity = 'learner';
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

  it('loads persistent classrooms from the authenticated API', async () => {
    const pending = service.load();
    http.expectOne(base).flush([classroom]);
    await pending;
    expect(service.classrooms()).toEqual([classroom]);
    expect(service.loading()).toBe(false);
  });

  it('creates a classroom without accepting client-side roles or tenant IDs', async () => {
    const pending = service.create(' Safety skills ');
    const request = http.expectOne(base);
    expect(request.request.body).toEqual({ title: 'Safety skills' });
    request.flush(classroom);
    await pending;
    expect(service.classrooms()).toEqual([classroom]);
  });

  it('surfaces an API outage instead of showing a successful empty state', async () => {
    const pending = service.load();
    http
      .expectOne(base)
      .flush({ detail: 'Video unavailable.' }, { status: 503, statusText: 'Down' });
    await pending;
    expect(service.error()).toBe('Video unavailable.');
    expect(service.loading()).toBe(false);
  });

  it('joins without activating the microphone or camera', async () => {
    const microphone = jest.spyOn(room.localParticipant, 'setMicrophoneEnabled');
    const camera = jest.spyOn(room.localParticipant, 'setCameraEnabled');
    await join();
    expect(connect).toHaveBeenCalledWith('wss://media.example.com', 'short-lived-token');
    expect(microphone).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
    expect(service.state()).toBe(ConnectionState.Connected);
    expect(service.activeClassroom()).toEqual(classroom);
    expect(service.tiles()).toHaveLength(1);
    expect(service.tiles()[0].audio).toBeUndefined();
  });

  it('does not open a second connection on repeated join clicks', async () => {
    const first = service.join(classroom);
    await service.join(classroom);
    http.expectOne(`${base}/classroom-1/join`).flush({
      serverUrl: 'wss://media.example.com',
      token: 'token',
      canScreenShare: false,
    });
    await first;
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending credential request without opening media', async () => {
    const pending = service.join(classroom);
    await service.leave();
    http.expectOne(`${base}/classroom-1/join`).flush({
      serverUrl: 'wss://media.example.com',
      token: 'token',
      canScreenShare: false,
    });
    await pending;
    expect(connect).not.toHaveBeenCalled();
    expect(service.state()).toBe(ConnectionState.Disconnected);
    expect(service.busy()).toBe(false);
  });

  it('cleans up a connection failure and allows a retry', async () => {
    connect.mockRejectedValueOnce(new Error('Network failed'));
    await join();
    expect(disconnect).toHaveBeenCalled();
    expect(service.error()).toContain('Network failed');
    expect(service.activeClassroom()).toBeNull();
    expect(service.busy()).toBe(false);
    await join();
    expect(service.state()).toBe(ConnectionState.Connected);
    expect(service.error()).toBe('');
  });

  it('does not permit learner screen publishing through the controls', async () => {
    const screen = jest
      .spyOn(room.localParticipant, 'setScreenShareEnabled')
      .mockResolvedValue(undefined);
    await join();
    await service.toggle('screen');
    expect(screen).not.toHaveBeenCalled();
  });

  it('uses Chrome-friendly screen capture settings for instructors', async () => {
    const screen = jest
      .spyOn(room.localParticipant, 'setScreenShareEnabled')
      .mockResolvedValue(undefined);
    await join(true);
    await service.toggle('screen');
    expect(screen).toHaveBeenCalledWith(true, {
      resolution: ScreenSharePresets.h1080fps15.resolution,
      contentHint: 'detail',
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  });

  it('reports Chrome permission denial without leaving the room', async () => {
    jest
      .spyOn(room.localParticipant, 'setMicrophoneEnabled')
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    await join();
    await service.toggle('microphone');
    expect(service.error()).toContain('Permission denied');
    expect(service.activeClassroom()).toEqual(classroom);
    expect(service.busy()).toBe(false);
  });

  it('cleans up capture that finishes after the participant leaves', async () => {
    let finish: (() => void) | undefined;
    jest.spyOn(room.localParticipant, 'setCameraEnabled').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    await join();
    const capture = service.toggle('camera');
    await service.leave();
    finish?.();
    await capture;
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(service.activeClassroom()).toBeNull();
    expect(service.tiles()).toEqual([]);
    expect(service.error()).toBe('');
  });

  it('updates connection status during reconnect and clears a disconnected room', async () => {
    await join();
    room.state = ConnectionState.Reconnecting;
    room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting);
    expect(service.state()).toBe(ConnectionState.Reconnecting);
    room.emit(RoomEvent.Disconnected);
    expect(service.activeClassroom()).toBeNull();
    expect(service.tiles()).toEqual([]);
    expect(service.error()).toContain('Disconnected');
  });

  it('disconnects and clears media on leave and component destruction', async () => {
    await join();
    service.ngOnDestroy();
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalled();
    expect(service.tiles()).toEqual([]);
    expect(service.activeClassroom()).toBeNull();
    expect(service.state()).toBe(ConnectionState.Disconnected);
  });

  it('allows Chrome audio playback to be unlocked by a user gesture', async () => {
    const start = jest.spyOn(room, 'startAudio').mockResolvedValue();
    await join();
    await service.startAudio();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('Chrome classroom defaults', () => {
  it('uses VP8 simulcast, 720p capture, speech audio and adaptive subscriptions', () => {
    TestBed.configureTestingModule({});
    const room = TestBed.inject(CLASSROOM_ROOM_FACTORY)();
    expect(room.options.adaptiveStream).toBe(true);
    expect(room.options.dynacast).toBe(true);
    expect(room.options.videoCaptureDefaults.resolution).toMatchObject({
      width: 1280,
      height: 720,
    });
    expect(room.options.publishDefaults).toMatchObject({
      videoCodec: 'vp8',
      simulcast: true,
      dtx: true,
      red: true,
      stopMicTrackOnMute: true,
    });
    expect(room.options.audioCaptureDefaults).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  });
});
