import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  Participant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
} from 'livekit-client';
import { firstValueFrom } from 'rxjs';

export interface Classroom {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  maxParticipants: number;
}

interface JoinCredentials {
  serverUrl: string;
  token: string;
  canScreenShare: boolean;
}

export const CLASSROOM_ROOM_FACTORY = new InjectionToken<() => Room>('CLASSROOM_ROOM_FACTORY', {
  providedIn: 'root',
  factory: () => () =>
    new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution, facingMode: 'user' },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      publishDefaults: {
        videoCodec: 'vp8',
        videoEncoding: VideoPresets.h720.encoding,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        simulcast: true,
        audioPreset: AudioPresets.speech,
        dtx: true,
        red: true,
        stopMicTrackOnMute: true,
        screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
      },
    }),
});

export interface ClassroomTile {
  id: string;
  name: string;
  local: boolean;
  video?: Track;
  audio?: Track;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail;
    }
    return fallback;
  }
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

/**
 * Why the media server dropped us, in words a learner can act on. Join tokens use the
 * member id as identity, so opening the same classroom in a second tab or device ends
 * the first session with DUPLICATE_IDENTITY.
 */
function disconnectMessage(reason: DisconnectReason | undefined): string {
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'You joined this classroom from another tab or device, so this connection was closed.';
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'You were removed from the classroom.';
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return 'The classroom was closed.';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'The media server is restarting. Try joining again in a moment.';
    case undefined:
      return 'Disconnected from the classroom.';
    default:
      return `Disconnected from the classroom (reason ${reason}).`;
  }
}

@Injectable()
export class EngageService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;
  private readonly makeRoom = inject(CLASSROOM_ROOM_FACTORY);
  private room?: Room;
  private generation = 0;
  private destroyed = false;

  readonly classrooms = signal<Classroom[]>([]);
  readonly activeClassroom = signal<Classroom | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly state = signal(ConnectionState.Disconnected);
  readonly error = signal('');
  readonly tiles = signal<ClassroomTile[]>([]);
  readonly microphoneEnabled = signal(false);
  readonly cameraEnabled = signal(false);
  readonly screenShareEnabled = signal(false);
  readonly canScreenShare = signal(false);
  readonly needsAudioStart = signal(false);
  readonly supportsScreenShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  private url(path = ''): string {
    if (!this.base) throw new Error('Configure the Forge API to use video classrooms.');
    return forgeApiUrl(this.base, `/api/engage/classrooms${path}`);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const classrooms = await firstValueFrom(this.http.get<Classroom[]>(this.url()));
      if (!this.destroyed) this.classrooms.set(classrooms);
    } catch (error) {
      this.error.set(errorMessage(error, 'Could not load classrooms.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(title: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const classroom = await firstValueFrom(
        this.http.post<Classroom>(this.url(), { title: title.trim() }),
      );
      if (!this.destroyed) this.classrooms.update((rooms) => [classroom, ...rooms]);
    } catch (error) {
      this.error.set(errorMessage(error, 'Could not create the classroom.'));
    } finally {
      this.busy.set(false);
    }
  }

  async join(classroom: Classroom): Promise<void> {
    if (this.busy() || this.room || this.destroyed) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.error.set('');
    this.state.set(ConnectionState.Connecting);
    let room: Room | undefined;
    try {
      if (globalThis.isSecureContext === false) {
        throw new Error('Open the classroom over HTTPS (or localhost) in Chrome.');
      }
      const credentials = await firstValueFrom(
        this.http.post<JoinCredentials>(this.url(`/${classroom.id}/join`), {}),
      );
      if (generation !== this.generation) return;
      room = this.makeRoom();
      this.room = room;
      this.activeClassroom.set(classroom);
      this.canScreenShare.set(credentials.canScreenShare);
      this.listen(room);
      await room.connect(credentials.serverUrl, credentials.token);
      if (generation !== this.generation) {
        await room.disconnect();
        return;
      }
      this.refresh(room);
    } catch (error) {
      if (room) {
        try {
          await room.disconnect();
        } catch (cleanupError) {
          console.error('[Engage] Failed to clean up the unsuccessful connection', cleanupError);
        } finally {
          room.removeAllListeners();
        }
      }
      if (generation === this.generation) {
        this.reset();
        this.error.set(errorMessage(error, 'Could not join the classroom.'));
      }
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }

  async leave(): Promise<void> {
    ++this.generation;
    const room = this.room;
    this.reset();
    this.busy.set(false);
    if (room) {
      try {
        await room.disconnect();
      } catch (error) {
        this.error.set(errorMessage(error, 'Could not cleanly disconnect from the classroom.'));
      } finally {
        room.removeAllListeners();
      }
    }
  }

  async toggle(source: 'microphone' | 'camera' | 'screen'): Promise<void> {
    const room = this.room;
    if (!room || this.busy() || this.state() !== ConnectionState.Connected) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set('');
    try {
      const participant = room.localParticipant;
      if (source === 'microphone') {
        await participant.setMicrophoneEnabled(!participant.isMicrophoneEnabled);
      } else if (source === 'camera') {
        await participant.setCameraEnabled(!participant.isCameraEnabled);
      } else if (this.canScreenShare()) {
        await participant.setScreenShareEnabled(!participant.isScreenShareEnabled, {
          resolution: ScreenSharePresets.h1080fps15.resolution,
          contentHint: 'detail',
          audio: false,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
        });
      }
      if (this.room === room) {
        this.refresh(room);
      } else {
        await room.disconnect();
      }
    } catch (error) {
      if (this.room === room) {
        this.error.set(
          errorMessage(error, `Could not change ${source}. Check browser permissions.`),
        );
      } else {
        console.warn('[Engage] Media operation finished after leaving the classroom', error);
      }
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }

  async startAudio(): Promise<void> {
    try {
      await this.room?.startAudio();
      if (this.room) this.refresh(this.room);
    } catch (error) {
      this.error.set(errorMessage(error, 'Could not enable classroom audio.'));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    void this.leave();
  }

  private listen(room: Room): void {
    const refresh = () => {
      if (this.room === room) this.refresh(room);
    };
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
      .on(RoomEvent.ConnectionStateChanged, refresh)
      .on(RoomEvent.Disconnected, (reason) => {
        if (this.room !== room) return;
        this.reset();
        this.busy.set(false);
        room.removeAllListeners();
        this.error.set(disconnectMessage(reason));
      });
  }

  private refresh(room: Room): void {
    const participants: Participant[] = [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ];
    const tiles: ClassroomTile[] = [];
    for (const participant of participants) {
      const local = participant === room.localParticipant;
      const camera = participant.getTrackPublication(Track.Source.Camera);
      tiles.push({
        id: participant.identity,
        name: `${participant.name || 'Class participant'}${local ? ' (you)' : ''}`,
        local,
        video: camera?.isMuted ? undefined : camera?.track,
        audio: local ? undefined : participant.getTrackPublication(Track.Source.Microphone)?.track,
      });
      const screen = participant.getTrackPublication(Track.Source.ScreenShare);
      if (screen?.track && !screen.isMuted) {
        tiles.push({
          id: `${participant.identity}-screen`,
          name: `${participant.name || 'Instructor'} - screen`,
          local,
          video: screen.track,
          audio: local
            ? undefined
            : participant.getTrackPublication(Track.Source.ScreenShareAudio)?.track,
        });
      }
    }
    this.tiles.set(tiles);
    this.state.set(room.state);
    this.microphoneEnabled.set(room.localParticipant.isMicrophoneEnabled);
    this.cameraEnabled.set(room.localParticipant.isCameraEnabled);
    this.screenShareEnabled.set(room.localParticipant.isScreenShareEnabled);
    this.needsAudioStart.set(!room.canPlaybackAudio);
  }

  private reset(): void {
    this.room = undefined;
    this.activeClassroom.set(null);
    this.tiles.set([]);
    this.state.set(ConnectionState.Disconnected);
    this.microphoneEnabled.set(false);
    this.cameraEnabled.set(false);
    this.screenShareEnabled.set(false);
    this.canScreenShare.set(false);
    this.needsAudioStart.set(false);
  }
}
