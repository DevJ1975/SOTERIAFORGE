import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { type Observable, firstValueFrom } from 'rxjs';
import {
  type AttendanceRow,
  type Heatmap,
  type ModerationAction,
  type NewActivityInput,
  type SessionPing,
  type SessionState,
} from './engage-session.model';

export const STATE_POLL_MS = 5_000;
export const HEARTBEAT_MS = 30_000;
/** With no session yet, how often the classroom list is checked for one starting. */
export const DISCOVER_MS = 15_000;

function detail(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail;
    }
  }
  return fallback;
}

/**
 * The live session in the classroom the learner is connected to.
 *
 * The server is the only source of truth: every action returns the new SessionState
 * and the store replaces its copy. State arrives three ways (an action's reply, a
 * refetch after the server's data ping, a 5 second poll), so a reply is only applied
 * when its version is not older than the one held.
 */
@Injectable()
export class EngageSessionStore implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;
  private readonly zone = inject(NgZone);

  private classroomId: string | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private fetching = false;
  /** Bumped on attach/detach so a late reply for a classroom we left is dropped. */
  private generation = 0;

  readonly sessionId = signal<string | null>(null);
  readonly state = signal<SessionState | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  /** Server clock minus this device's clock, in milliseconds. */
  readonly clockOffsetMs = signal(0);
  /** The current server time, refreshed every second while attached. */
  readonly now = signal(Date.now());
  readonly heatmap = signal<Heatmap | null>(null);
  readonly attendance = signal<AttendanceRow[] | null>(null);

  readonly live = computed(() => this.state()?.status === 'live');
  readonly isHost = computed(() => this.state()?.me.isHost ?? false);

  private url(path: string): string {
    if (!this.base) throw new Error('Configure the Forge API to use video classrooms.');
    return forgeApiUrl(this.base, `/api/engage/${path}`);
  }

  /** Start following the classroom the learner has just connected to. */
  attach(classroomId: string, sessionId: string | null): void {
    this.detach();
    this.classroomId = classroomId;
    this.tick();
    // Outside the zone: standing timers must not hold the app "unstable"; the signals
    // they set still repaint the views that read them.
    this.timers = this.zone.runOutsideAngular(() => [
      setInterval(() => this.tick(), 1000),
      setInterval(() => void this.poll(), STATE_POLL_MS),
      setInterval(() => void this.heartbeat(), HEARTBEAT_MS),
      setInterval(() => void this.discover(), DISCOVER_MS),
    ]);
    if (sessionId) this.follow(sessionId);
  }

  /** Stop every timer and forget the session (leaving the room, or destroy). */
  detach(): void {
    ++this.generation;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.classroomId = null;
    this.sessionId.set(null);
    this.state.set(null);
    this.heatmap.set(null);
    this.attendance.set(null);
    this.error.set('');
    this.busy.set(false);
  }

  ngOnDestroy(): void {
    this.detach();
  }

  /** The server said something changed: refetch when it is news to us. */
  ping(ping: SessionPing): void {
    if (!this.classroomId) return;
    if (ping.sessionId !== this.sessionId()) {
      this.follow(ping.sessionId);
    } else if (ping.version > (this.state()?.version ?? -1)) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const id = this.sessionId();
    if (!id || this.fetching) return;
    const generation = this.generation;
    this.fetching = true;
    try {
      const state = await firstValueFrom(
        this.http.get<SessionState>(this.url(`sessions/${id}/state`)),
      );
      if (generation === this.generation) this.apply(state);
    } catch (error) {
      // A missed poll is not worth an alert: the next one, or a ping, catches up.
      if (generation === this.generation && !this.state()) {
        this.error.set(detail(error, 'Could not load the live session.'));
      }
    } finally {
      this.fetching = false;
    }
  }

  // --- everyone -------------------------------------------------------------
  respond(activityId: string, optionId: string): Promise<boolean> {
    return this.act(
      () =>
        this.http.post<SessionState>(this.url(`activities/${activityId}/respond`), { optionId }),
      'Your answer could not be sent. Try again.',
    );
  }

  saveHuddle(text: string): Promise<boolean> {
    const id = this.sessionId();
    if (!id) return Promise.resolve(false);
    return this.act(
      () => this.http.put<SessionState>(this.url(`sessions/${id}/huddle`), { text }),
      'Your crew notes could not be saved.',
      false,
    );
  }

  async setHand(raised: boolean): Promise<void> {
    const id = this.sessionId();
    if (!id) return;
    const generation = this.generation;
    try {
      await firstValueFrom(this.http.post<void>(this.url(`sessions/${id}/hand`), { raised }));
      if (generation !== this.generation) return;
      // Show it at once; the next state confirms it.
      this.state.update((s) => (s ? { ...s, me: { ...s.me, handRaised: raised } } : s));
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(detail(error, 'Could not change your raised hand.'));
      }
    }
  }

  async loadHeatmap(): Promise<void> {
    const id = this.sessionId();
    if (!id) return;
    const generation = this.generation;
    try {
      const heatmap = await firstValueFrom(
        this.http.get<Heatmap>(this.url(`sessions/${id}/heatmap`)),
      );
      if (generation === this.generation) this.heatmap.set(heatmap);
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(detail(error, 'The debrief results could not be loaded.'));
      }
    }
  }

  // --- hosts ----------------------------------------------------------------
  async startSession(input: { title?: string; blocks?: number } = {}): Promise<boolean> {
    const classroomId = this.classroomId;
    if (!classroomId) return false;
    return this.act(
      () => this.http.post<SessionState>(this.url(`classrooms/${classroomId}/sessions`), input),
      'The session could not be started.',
    );
  }

  advance(): Promise<boolean> {
    return this.session(
      (id) => this.http.post<SessionState>(this.url(`sessions/${id}/advance`), {}),
      'The stage could not be changed.',
    );
  }

  end(): Promise<boolean> {
    return this.session(
      (id) => this.http.post<SessionState>(this.url(`sessions/${id}/end`), {}),
      'The session could not be ended.',
    );
  }

  launch(input: NewActivityInput): Promise<boolean> {
    return this.session(
      (id) => this.http.post<SessionState>(this.url(`sessions/${id}/activities`), input),
      'The activity could not be started.',
    );
  }

  closeActivity(activityId: string): Promise<boolean> {
    return this.act(
      () => this.http.post<SessionState>(this.url(`activities/${activityId}/close`), {}),
      'The activity could not be closed.',
    );
  }

  async moderate(memberId: string, action: ModerationAction): Promise<boolean> {
    const id = this.sessionId();
    if (!id) return false;
    const generation = this.generation;
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.post<void>(this.url(`sessions/${id}/participants/${memberId}/moderate`), {
          action,
        }),
      );
      if (generation === this.generation) void this.refresh();
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.error.set(detail(error, 'That action did not go through.'));
      return false;
    }
  }

  async loadAttendance(): Promise<void> {
    const id = this.sessionId();
    if (!id) return;
    const generation = this.generation;
    try {
      const rows = await firstValueFrom(
        this.http.get<AttendanceRow[]>(this.url(`sessions/${id}/attendance`)),
      );
      if (generation === this.generation) this.attendance.set(rows);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(detail(error, 'Attendance could not be loaded.'));
    }
  }

  // --- internals --------------------------------------------------------------
  private follow(sessionId: string): void {
    this.sessionId.set(sessionId);
    this.state.set(null);
    this.heatmap.set(null);
    this.attendance.set(null);
    void this.refresh();
    void this.heartbeat();
  }

  /** Take a state unless it is older than the one held for the same session. */
  private apply(state: SessionState): void {
    const held = this.state();
    if (held && held.id === state.id && state.version < held.version) return;
    const server = Date.parse(state.serverTime);
    if (!Number.isNaN(server)) this.clockOffsetMs.set(server - Date.now());
    const fresh = this.sessionId() !== state.id;
    if (fresh) this.sessionId.set(state.id);
    this.state.set(state);
    this.tick();
    // A session the host has just started: record them as present straight away.
    if (fresh) void this.heartbeat();
  }

  private tick(): void {
    this.now.set(Date.now() + this.clockOffsetMs());
  }

  private async poll(): Promise<void> {
    if (this.sessionId() && this.state()?.status !== 'ended') await this.refresh();
  }

  private async heartbeat(): Promise<void> {
    const id = this.sessionId();
    if (!id || this.state()?.status === 'ended') return;
    try {
      await firstValueFrom(this.http.post<void>(this.url(`sessions/${id}/heartbeat`), {}));
    } catch {
      // Attendance catches up on the next beat.
    }
  }

  /** No session yet, or the last one ended: see whether the classroom has a new one. */
  private async discover(): Promise<void> {
    const classroomId = this.classroomId;
    if (!classroomId || (this.sessionId() && this.state()?.status !== 'ended')) return;
    const generation = this.generation;
    try {
      const rooms = await firstValueFrom(
        this.http.get<{ id: string; liveSessionId?: string | null }[]>(this.url('classrooms')),
      );
      const live = rooms.find((room) => room.id === classroomId)?.liveSessionId;
      if (generation === this.generation && live && live !== this.sessionId()) this.follow(live);
    } catch {
      // The data ping is the primary signal; this is only the fallback.
    }
  }

  private session(
    call: (sessionId: string) => Observable<SessionState>,
    fallback: string,
  ): Promise<boolean> {
    const id = this.sessionId();
    if (!id) return Promise.resolve(false);
    return this.act(() => call(id), fallback);
  }

  private async act(
    call: () => Observable<SessionState>,
    fallback: string,
    exclusive = true,
  ): Promise<boolean> {
    if (exclusive && this.busy()) return false;
    const generation = this.generation;
    if (exclusive) this.busy.set(true);
    this.error.set('');
    try {
      const state = await firstValueFrom(call());
      if (generation === this.generation) this.apply(state);
      return true;
    } catch (error) {
      if (generation === this.generation) this.error.set(detail(error, fallback));
      return false;
    } finally {
      if (exclusive && generation === this.generation) this.busy.set(false);
    }
  }
}
