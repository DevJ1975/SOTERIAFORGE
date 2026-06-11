/**
 * Firestore-backed realtime opponent provider for PERIL! (Phase 4).
 *
 * Host-authoritative matches over /tenants/{t}/matches/{matchId} (+ an
 * append-only events subcollection), with no Cloud Functions in the loop:
 *
 *  - Lobby:    joinLobby() queries open matches in the tenant and joins the
 *              freshest; if none appears within the scan window it hosts a
 *              new open match and waits LOBBY_HOST_WAIT_MS for joiners; if
 *              still alone it resolves with ZERO opponents so the existing
 *              AI fallback seats the house bots (it never throws — signed
 *              out callers resolve [] immediately).
 *  - Playing:  every client appends its own buzz/answer/wager/select events;
 *              remote events are fanned out as OpponentEvents. The host
 *              additionally publishes throttled (≥250ms) 'state' snapshots
 *              of the authoritative game state, which guests use to
 *              reconcile scores.
 *  - Leaving:  the host flips status to 'abandoned' on leave()/beforeunload
 *              (best effort); guests are notified via onMatchEnded so the
 *              scenes can show "Host left — match ended" and offer an AI
 *              rematch.
 *
 * All Firestore SDK calls live behind the small {@link MatchTransport} seam
 * so the protocol logic is unit-testable without an emulator.
 */

import {
  arrayUnion,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { matchDoc, matchEventDoc, matchEventsCol, matchesCol } from '@forge/data-access';
import type {
  PerilMatch,
  PerilMatchEvent,
  PerilMatchEventType,
  PerilMatchPlayer,
  PerilMatchStatus,
} from '@forge/shared';
import {
  HostStateListener,
  MatchEndListener,
  OpponentEvent,
  OpponentEventListener,
  OpponentProfile,
  OpponentProvider,
  Unsubscribe,
} from './opponent-provider';
import {
  LOBBY_HOST_WAIT_MS,
  LOBBY_POLL_MS,
  LocalMatchAction,
  STATE_THROTTLE_MS,
  avatarForUid,
  nextPublishDelay,
  opponentEventFrom,
  pickFreshestOpenMatch,
  serializeAction,
} from './match-protocol';

/** Identity of the local player (from @forge/auth PrincipalStore claims). */
export interface MatchPrincipal {
  uid: string;
  displayName: string;
  tenantId: string;
}

/** Minimal transport seam over the Firestore SDK (fakeable in Jest). */
export interface MatchTransport {
  newMatchId(): string;
  newEventId(matchId: string): string;
  /** Open matches in the tenant (any order; the provider picks the freshest). */
  findOpenMatches(max: number): Promise<PerilMatch[]>;
  createMatch(match: PerilMatch): Promise<void>;
  /** arrayUnion-style join: appends the player and bumps updatedAt. */
  joinMatch(matchId: string, player: PerilMatchPlayer, updatedAtIso: string): Promise<void>;
  setStatus(matchId: string, status: PerilMatchStatus, updatedAtIso: string): Promise<void>;
  appendEvent(matchId: string, event: PerilMatchEvent): Promise<void>;
  watchMatch(matchId: string, onChange: (match: PerilMatch) => void): Unsubscribe;
  /** Streams events appended at/after `sinceIso`, in `at` order. */
  watchEvents(
    matchId: string,
    sinceIso: string,
    onEvent: (event: PerilMatchEvent) => void,
  ): Unsubscribe;
}

/** Production transport over the modular Firestore client SDK. */
export function createFirestoreMatchTransport(db: Firestore, tenantId: string): MatchTransport {
  return {
    newMatchId: () => matchDoc(db, tenantId).id,
    newEventId: (matchId) => matchEventDoc(db, tenantId, matchId).id,
    async findOpenMatches(max: number): Promise<PerilMatch[]> {
      // Equality-only filter (no composite index needed); the provider sorts.
      const snap = await getDocs(
        query(matchesCol(db, tenantId), where('status', '==', 'open'), limit(max)),
      );
      const matches: PerilMatch[] = [];
      for (const docSnap of snap.docs) {
        try {
          matches.push(docSnap.data());
        } catch {
          // Skip documents that fail schema validation.
        }
      }
      return matches;
    },
    async createMatch(match: PerilMatch): Promise<void> {
      await setDoc(matchDoc(db, tenantId, match.id), match);
    },
    async joinMatch(matchId, player, updatedAtIso): Promise<void> {
      // Raw ref: updateDoc field paths bypass the zod converter by design.
      await updateDoc(doc(db, 'tenants', tenantId, 'matches', matchId), {
        players: arrayUnion(player),
        updatedAt: updatedAtIso,
      });
    },
    async setStatus(matchId, status, updatedAtIso): Promise<void> {
      await updateDoc(doc(db, 'tenants', tenantId, 'matches', matchId), {
        status,
        updatedAt: updatedAtIso,
      });
    },
    async appendEvent(matchId, event): Promise<void> {
      await setDoc(matchEventDoc(db, tenantId, matchId, event.id), event);
    },
    watchMatch(matchId, onChange): Unsubscribe {
      return onSnapshot(
        matchDoc(db, tenantId, matchId),
        (snap) => {
          if (!snap.exists()) return;
          try {
            onChange(snap.data());
          } catch {
            // Malformed doc: ignore the snapshot.
          }
        },
        () => undefined,
      );
    },
    watchEvents(matchId, sinceIso, onEvent): Unsubscribe {
      const eventsQuery = query(
        matchEventsCol(db, tenantId, matchId),
        where('at', '>=', sinceIso),
        orderBy('at', 'asc'),
      );
      return onSnapshot(
        eventsQuery,
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type !== 'added') continue;
            try {
              onEvent(change.doc.data());
            } catch {
              // Malformed event: skip it.
            }
          }
        },
        () => undefined,
      );
    },
  };
}

export interface FirestoreMatchProviderDeps {
  /** Null when Firestore is unavailable (joinLobby then resolves []). */
  transport?: MatchTransport | null;
  /** Null when signed out (joinLobby then resolves [] immediately). */
  principal?: MatchPrincipal | null;
  now?: () => number;
  /** Seed source for new matches. */
  random?: () => number;
  /** Best-effort host-abandon hook; defaults to window 'beforeunload'. */
  registerBeforeUnload?: (handler: () => void) => Unsubscribe;
}

function defaultRegisterBeforeUnload(handler: () => void): Unsubscribe {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

export class FirestoreMatchProvider implements OpponentProvider {
  readonly isRealtime = true;

  private readonly transport: MatchTransport | null;
  private readonly principal: MatchPrincipal | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly registerBeforeUnload: (handler: () => void) => Unsubscribe;

  private role: 'none' | 'host' | 'guest' = 'none';
  private match: PerilMatch | null = null;
  private disposed = false;
  private endNotified = false;
  private completed = false;

  private readonly listeners = new Set<OpponentEventListener>();
  private readonly hostStateListeners = new Set<HostStateListener>();
  private readonly matchEndListeners = new Set<MatchEndListener>();
  private readonly snapshotWaiters = new Set<() => void>();
  private readonly cancelableDelays = new Map<ReturnType<typeof setTimeout>, () => void>();

  private unsubMatch: Unsubscribe | null = null;
  private unsubEvents: Unsubscribe | null = null;
  private unsubBeforeUnload: Unsubscribe | null = null;

  private lastStateAt = Number.NEGATIVE_INFINITY;
  private pendingState: Record<string, unknown> | null = null;
  private stateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: FirestoreMatchProviderDeps = {}) {
    this.transport = deps.transport ?? null;
    this.principal = deps.principal ?? null;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.registerBeforeUnload = deps.registerBeforeUnload ?? defaultRegisterBeforeUnload;
  }

  // ---- Lobby --------------------------------------------------------------------

  /**
   * Searches the tenant's open matches for up to `scanMs`, hosting a new
   * match (and waiting LOBBY_HOST_WAIT_MS for joiners) when none is found.
   * Resolves with the HUMAN opponents that will play; an empty array means
   * "nobody showed up — seat the AI bots". Never rejects.
   */
  async joinLobby(scanMs: number): Promise<OpponentProfile[]> {
    if (!this.transport || !this.principal || this.disposed) return [];
    try {
      if (await this.searchAndJoin(scanMs)) return this.opponentProfiles();
      return await this.hostAndWait();
    } catch {
      this.detach();
      return [];
    }
  }

  private async searchAndJoin(scanMs: number): Promise<boolean> {
    const transport = this.transport as MatchTransport;
    const principal = this.principal as MatchPrincipal;
    const deadline = this.now() + scanMs;
    for (;;) {
      if (this.disposed) return false;
      const open = await transport.findOpenMatches(10);
      const pick = pickFreshestOpenMatch(open, principal.uid);
      if (pick) {
        const joinedAt = new Date(this.now()).toISOString();
        const self: PerilMatchPlayer = {
          uid: principal.uid,
          displayName: principal.displayName,
          joinedAt,
        };
        await transport.joinMatch(pick.id, self, joinedAt);
        this.match = { ...pick, players: [...pick.players, self], updatedAt: joinedAt };
        this.attach(pick.id, 'guest', joinedAt);
        // Give the live snapshot a moment to deliver the final roster.
        await this.waitForSnapshot(() => this.hasSelfInRoster(), 2000);
        return true;
      }
      const remaining = deadline - this.now();
      if (remaining <= 0) return false;
      await this.delay(Math.min(LOBBY_POLL_MS, remaining));
    }
  }

  private async hostAndWait(): Promise<OpponentProfile[]> {
    const transport = this.transport as MatchTransport;
    const principal = this.principal as MatchPrincipal;
    if (this.disposed) return [];
    const createdAt = new Date(this.now()).toISOString();
    const match: PerilMatch = {
      id: transport.newMatchId(),
      tenantId: principal.tenantId,
      hostUid: principal.uid,
      status: 'open',
      createdAt,
      players: [{ uid: principal.uid, displayName: principal.displayName, joinedAt: createdAt }],
      seed: Math.floor(this.random() * 0x7fffffff),
      updatedAt: createdAt,
    };
    await transport.createMatch(match);
    this.match = match;
    this.attach(match.id, 'host', createdAt);
    await this.waitForSnapshot(() => this.opponentProfiles().length > 0, LOBBY_HOST_WAIT_MS);
    if (this.opponentProfiles().length === 0) {
      // Nobody joined: retire the lobby so it stops attracting joiners and
      // hand control back to the AI fallback path.
      void this.setStatusSafe('abandoned');
      this.detach();
      return [];
    }
    return this.opponentProfiles();
  }

  // ---- Roster accessors (used by the lobby scene) ----------------------------------

  /** Latest known match (null until joinLobby seats us). */
  get currentMatch(): PerilMatch | null {
    return this.match;
  }

  /** Deterministic clue-selection seed shared by all clients. */
  get matchSeed(): number | null {
    return this.match?.seed ?? null;
  }

  /** Seated players in join order (host first) — identical on every client. */
  get players(): PerilMatchPlayer[] {
    return this.match?.players ?? [];
  }

  get hostUid(): string | null {
    return this.match?.hostUid ?? null;
  }

  get selfUid(): string | null {
    return this.principal?.uid ?? null;
  }

  get isHost(): boolean {
    return this.role === 'host';
  }

  /** Every seated human except the local player, as opponent profiles. */
  opponentProfiles(): OpponentProfile[] {
    const selfUid = this.principal?.uid;
    return this.players
      .filter((p) => p.uid !== selfUid)
      .map((p) => ({ id: p.uid, name: p.displayName, avatar: avatarForUid(p.uid) }));
  }

  // ---- OpponentProvider: realtime fan-out -------------------------------------------

  subscribe(listener: OpponentEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Remote humans buzz themselves; nothing to schedule locally. */
  openBuzzers(): void {
    // Intentionally empty: buzz events arrive over the wire.
  }

  closeBuzzers(): void {
    // Intentionally empty: the scene gates stale buzz events by phase.
  }

  /** Remote clients submit their own answers; we just wait for the event. */
  requestAnswer(): void {
    // Intentionally empty.
  }

  /** Remote clients submit their own wagers; we just wait for the event. */
  requestWager(): void {
    // Intentionally empty.
  }

  /**
   * No bot timers to cancel; match listeners must survive scene transitions,
   * so this is intentionally a no-op (teardown happens in leave()).
   */
  cancelPending(): void {
    // Intentionally empty.
  }

  /** Leaves the match: hosts abandon it (best effort) unless it finished. */
  leave(): void {
    if (this.role === 'host' && !this.completed && this.isLive()) {
      void this.setStatusSafe('abandoned');
    }
    this.detach();
    this.listeners.clear();
    this.hostStateListeners.clear();
    this.matchEndListeners.clear();
    this.disposed = true;
  }

  // ---- Local player actions ------------------------------------------------------

  sendLocalBuzz(latencyMs: number): void {
    this.sendAction({ kind: 'buzz', latencyMs });
  }

  sendLocalAnswer(optionIndex: number, thinkMs: number): void {
    this.sendAction({ kind: 'answer', optionIndex, thinkMs });
  }

  sendLocalWager(kind: 'daily-double' | 'final', amount: number): void {
    this.sendAction({ kind: 'wager', wagerKind: kind, amount });
  }

  sendLocalSelect(categoryIndex: number, clueIndex: number): void {
    this.sendAction({ kind: 'select', categoryIndex, clueIndex });
  }

  // ---- Host protocol ----------------------------------------------------------------

  /** Host: throttled (≥STATE_THROTTLE_MS) authoritative snapshot publish. */
  publishState(state: Record<string, unknown>): void {
    if (this.role !== 'host' || !this.match) return;
    this.pendingState = state;
    const delay = nextPublishDelay(this.lastStateAt, this.now(), STATE_THROTTLE_MS);
    if (delay <= 0) {
      this.flushState();
    } else if (this.stateTimer === null) {
      this.stateTimer = setTimeout(() => {
        this.stateTimer = null;
        this.flushState();
      }, delay);
    }
  }

  onHostState(listener: HostStateListener): Unsubscribe {
    this.hostStateListeners.add(listener);
    return () => this.hostStateListeners.delete(listener);
  }

  onMatchEnded(listener: MatchEndListener): Unsubscribe {
    this.matchEndListeners.add(listener);
    return () => this.matchEndListeners.delete(listener);
  }

  /** Host: the lobby countdown finished — lock the match to 'playing'. */
  markStarted(): void {
    if (this.role !== 'host') return;
    void this.setStatusSafe('playing');
  }

  /** Host: the game reached its natural end. */
  completeMatch(): void {
    if (this.role !== 'host') return;
    this.completed = true;
    void this.setStatusSafe('finished');
  }

  // ---- Internals -----------------------------------------------------------------------

  private attach(matchId: string, role: 'host' | 'guest', sinceIso: string): void {
    const transport = this.transport as MatchTransport;
    this.role = role;
    this.unsubMatch = transport.watchMatch(matchId, (m) => this.onMatchSnapshot(m));
    this.unsubEvents = transport.watchEvents(matchId, sinceIso, (e) => this.onMatchEvent(e));
    if (role === 'host') {
      this.unsubBeforeUnload = this.registerBeforeUnload(() => {
        if (!this.completed && this.isLive()) void this.setStatusSafe('abandoned');
      });
    }
  }

  private detach(): void {
    this.role = 'none';
    this.unsubMatch?.();
    this.unsubEvents?.();
    this.unsubBeforeUnload?.();
    this.unsubMatch = this.unsubEvents = this.unsubBeforeUnload = null;
    if (this.stateTimer !== null) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
    for (const [timer, resolve] of this.cancelableDelays) {
      clearTimeout(timer);
      resolve();
    }
    this.cancelableDelays.clear();
    for (const waiter of [...this.snapshotWaiters]) waiter();
    this.snapshotWaiters.clear();
  }

  private onMatchSnapshot(match: PerilMatch): void {
    const previous = this.match;
    this.match = match;
    for (const waiter of [...this.snapshotWaiters]) waiter();
    if (
      this.role === 'guest' &&
      !this.endNotified &&
      match.status === 'abandoned' &&
      previous?.status !== 'abandoned'
    ) {
      this.endNotified = true;
      this.emit({ type: 'leave', opponentId: match.hostUid });
      for (const listener of [...this.matchEndListeners]) listener('host-left');
    }
  }

  private onMatchEvent(event: PerilMatchEvent): void {
    if (this.disposed || event.uid === this.principal?.uid) return;
    if (event.type === 'state') {
      if (event.uid !== this.match?.hostUid) return; // only the host is authoritative
      for (const listener of [...this.hostStateListeners]) listener(event.payload);
      return;
    }
    const opponentEvent = opponentEventFrom(event);
    if (opponentEvent) this.emit(opponentEvent);
  }

  private emit(event: OpponentEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private sendAction(action: LocalMatchAction): void {
    if (!this.transport || !this.principal || !this.match || this.disposed) return;
    const { type, payload } = serializeAction(action);
    this.appendEventSafe(type, payload);
  }

  private appendEventSafe(type: PerilMatchEventType, payload: Record<string, unknown>): void {
    const transport = this.transport;
    const match = this.match;
    const principal = this.principal;
    if (!transport || !match || !principal) return;
    const event: PerilMatchEvent = {
      id: transport.newEventId(match.id),
      matchId: match.id,
      uid: principal.uid,
      at: new Date(this.now()).toISOString(),
      type,
      payload,
    };
    void transport.appendEvent(match.id, event).catch(() => undefined);
  }

  private flushState(): void {
    if (!this.pendingState) return;
    this.lastStateAt = this.now();
    const state = this.pendingState;
    this.pendingState = null;
    this.appendEventSafe('state', state);
  }

  private isLive(): boolean {
    const status = this.match?.status;
    return status === 'open' || status === 'playing';
  }

  private hasSelfInRoster(): boolean {
    const selfUid = this.principal?.uid;
    return !!selfUid && this.players.some((p) => p.uid === selfUid);
  }

  private async setStatusSafe(status: PerilMatchStatus): Promise<void> {
    const transport = this.transport;
    const match = this.match;
    if (!transport || !match) return;
    try {
      await transport.setStatus(match.id, status, new Date(this.now()).toISOString());
      this.match = { ...match, status };
    } catch {
      // Best effort only.
    }
  }

  /** Resolves after `ms`, or immediately when the provider detaches. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cancelableDelays.delete(timer);
        resolve();
      }, ms);
      this.cancelableDelays.set(timer, resolve);
    });
  }

  /** Resolves when `predicate()` turns true on a snapshot, or after `timeoutMs`. */
  private waitForSnapshot(predicate: () => boolean, timeoutMs: number): Promise<void> {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.snapshotWaiters.delete(check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (predicate() || this.disposed || this.role === 'none') finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.snapshotWaiters.add(check);
    });
  }
}
