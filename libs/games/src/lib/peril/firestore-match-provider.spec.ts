/**
 * FirestoreMatchProvider protocol tests — no real Firestore. The SDK lives
 * behind the MatchTransport seam, so the lobby decisions (join freshest /
 * host / AI fallback timing), event fan-out, host snapshot throttling, and
 * abandon semantics are all driven by a fake transport + Jest fake timers.
 */

import type {
  PerilMatch,
  PerilMatchEvent,
  PerilMatchPlayer,
  PerilMatchStatus,
} from '@forge/shared';
import { FirestoreMatchProvider, MatchPrincipal, MatchTransport } from './firestore-match-provider';
import { LOBBY_HOST_WAIT_MS, LOBBY_SEARCH_MS, STATE_THROTTLE_MS } from './match-protocol';
import { OpponentEvent, Unsubscribe } from './opponent-provider';

const ME: MatchPrincipal = { uid: 'me', displayName: 'Jamil', tenantId: 'acme' };

const ISO = '2026-06-11T12:00:00.000Z';

function player(uid: string): PerilMatchPlayer {
  return { uid, displayName: `Player ${uid}`, joinedAt: ISO };
}

function openMatch(id: string, hostUid: string, createdAt = ISO): PerilMatch {
  return {
    id,
    tenantId: 'acme',
    hostUid,
    status: 'open',
    createdAt,
    players: [player(hostUid)],
    seed: 4242,
    updatedAt: createdAt,
  };
}

class FakeTransport implements MatchTransport {
  matches = new Map<string, PerilMatch>();
  events: PerilMatchEvent[] = [];
  findCalls = 0;
  private ids = 0;
  private matchWatchers = new Map<string, Set<(m: PerilMatch) => void>>();
  private eventWatchers = new Map<
    string,
    Set<{ sinceIso: string; cb: (e: PerilMatchEvent) => void }>
  >();

  newMatchId(): string {
    return `match-${++this.ids}`;
  }

  newEventId(): string {
    return `evt-${++this.ids}`;
  }

  findOpenMatches(): Promise<PerilMatch[]> {
    this.findCalls++;
    return Promise.resolve([...this.matches.values()].filter((m) => m.status === 'open'));
  }

  createMatch(match: PerilMatch): Promise<void> {
    this.matches.set(match.id, match);
    this.notifyMatch(match.id);
    return Promise.resolve();
  }

  joinMatch(matchId: string, joiner: PerilMatchPlayer, updatedAtIso: string): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match) return Promise.reject(new Error('missing match'));
    this.matches.set(matchId, {
      ...match,
      players: [...match.players, joiner],
      updatedAt: updatedAtIso,
    });
    this.notifyMatch(matchId);
    return Promise.resolve();
  }

  setStatus(matchId: string, status: PerilMatchStatus, updatedAtIso: string): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match) return Promise.reject(new Error('missing match'));
    this.matches.set(matchId, { ...match, status, updatedAt: updatedAtIso });
    this.notifyMatch(matchId);
    return Promise.resolve();
  }

  appendEvent(matchId: string, event: PerilMatchEvent): Promise<void> {
    this.events.push(event);
    for (const watcher of this.eventWatchers.get(matchId) ?? []) {
      if (event.at >= watcher.sinceIso) watcher.cb(event);
    }
    return Promise.resolve();
  }

  watchMatch(matchId: string, onChange: (m: PerilMatch) => void): Unsubscribe {
    const set = this.matchWatchers.get(matchId) ?? new Set();
    set.add(onChange);
    this.matchWatchers.set(matchId, set);
    const current = this.matches.get(matchId);
    if (current) onChange(current); // like onSnapshot's initial emission
    return () => set.delete(onChange);
  }

  watchEvents(
    matchId: string,
    sinceIso: string,
    onEvent: (e: PerilMatchEvent) => void,
  ): Unsubscribe {
    const watcher = { sinceIso, cb: onEvent };
    const set = this.eventWatchers.get(matchId) ?? new Set();
    set.add(watcher);
    this.eventWatchers.set(matchId, set);
    for (const event of this.events) {
      if (event.matchId === matchId && event.at >= sinceIso) onEvent(event);
    }
    return () => set.delete(watcher);
  }

  /** Another client's action, delivered through the live event stream. */
  simulateEvent(
    matchId: string,
    uid: string,
    type: PerilMatchEvent['type'],
    payload: Record<string, unknown>,
  ): void {
    void this.appendEvent(matchId, {
      id: this.newEventId(),
      matchId,
      uid,
      at: new Date(Date.now()).toISOString(),
      type,
      payload,
    });
  }

  stateEventsFor(matchId: string): PerilMatchEvent[] {
    return this.events.filter((e) => e.matchId === matchId && e.type === 'state');
  }

  private notifyMatch(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    for (const cb of [...(this.matchWatchers.get(matchId) ?? [])]) cb(match);
  }
}

describe('FirestoreMatchProvider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeProvider(
    transport: FakeTransport,
    deps: { registerBeforeUnload?: (fn: () => void) => Unsubscribe } = {},
  ) {
    return new FirestoreMatchProvider({
      transport,
      principal: ME,
      random: () => 0.5,
      ...deps,
    });
  }

  describe('lobby: joining', () => {
    it('joins the freshest open match and resolves with its players', async () => {
      const transport = new FakeTransport();
      transport.matches.set('stale', openMatch('stale', 'host-old', '2026-06-11T11:00:00.000Z'));
      transport.matches.set('fresh', openMatch('fresh', 'host-new', '2026-06-11T11:45:00.000Z'));
      const provider = makeProvider(transport);

      const opponents = await provider.joinLobby(LOBBY_SEARCH_MS);

      expect(opponents.map((o) => o.id)).toEqual(['host-new']);
      expect(opponents[0].name).toBe('Player host-new');
      expect(transport.matches.get('fresh')?.players.map((p) => p.uid)).toEqual(['host-new', 'me']);
      expect(provider.isHost).toBe(false);
      expect(provider.matchSeed).toBe(4242);
      provider.leave();
      // Guests never abandon the match on leave.
      expect(transport.matches.get('fresh')?.status).toBe('open');
    });

    it('keeps polling during the scan window and joins a match that appears late', async () => {
      const transport = new FakeTransport();
      const provider = makeProvider(transport);

      const promise = provider.joinLobby(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(1500); // first retry fires
      transport.matches.set('late', openMatch('late', 'host-late'));
      await jest.advanceTimersByTimeAsync(1500); // second retry finds it

      const opponents = await promise;
      expect(opponents.map((o) => o.id)).toEqual(['host-late']);
      expect(transport.findCalls).toBeGreaterThanOrEqual(2);
      provider.leave();
    });
  });

  describe('lobby: hosting', () => {
    it('hosts an open match when the floor is empty and resolves when a joiner arrives', async () => {
      const transport = new FakeTransport();
      const provider = makeProvider(transport);

      const promise = provider.joinLobby(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(0);

      expect(transport.matches.size).toBe(1);
      const hosted = [...transport.matches.values()][0];
      expect(hosted.hostUid).toBe('me');
      expect(hosted.status).toBe('open');

      await transport.joinMatch(hosted.id, player('guest-9'), new Date().toISOString());
      const opponents = await promise;

      expect(opponents.map((o) => o.id)).toEqual(['guest-9']);
      expect(provider.isHost).toBe(true);

      provider.markStarted();
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.matches.get(hosted.id)?.status).toBe('playing');

      provider.completeMatch();
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.matches.get(hosted.id)?.status).toBe('finished');

      // A finished match is not re-abandoned on leave.
      provider.leave();
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.matches.get(hosted.id)?.status).toBe('finished');
    });

    it('resolves with zero opponents (AI fallback) and abandons the lobby when nobody joins', async () => {
      const transport = new FakeTransport();
      const provider = makeProvider(transport);

      const promise = provider.joinLobby(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(LOBBY_SEARCH_MS + LOBBY_HOST_WAIT_MS);
      await jest.advanceTimersByTimeAsync(0);

      await expect(promise).resolves.toEqual([]);
      const hosted = [...transport.matches.values()][0];
      expect(hosted.status).toBe('abandoned');
    });

    it('never rejects, even when the transport blows up', async () => {
      const transport = new FakeTransport();
      transport.findOpenMatches = () => Promise.reject(new Error('offline'));
      const provider = makeProvider(transport);
      await expect(provider.joinLobby(LOBBY_SEARCH_MS)).resolves.toEqual([]);
    });
  });

  describe('event fan-out', () => {
    async function joinedGuest() {
      const transport = new FakeTransport();
      transport.matches.set('m', openMatch('m', 'host-1'));
      const provider = makeProvider(transport);
      await provider.joinLobby(LOBBY_SEARCH_MS);
      return { transport, provider };
    }

    it('maps remote events to OpponentEvents and ignores its own', async () => {
      const { transport, provider } = await joinedGuest();
      const received: OpponentEvent[] = [];
      provider.subscribe((e) => received.push(e));

      transport.simulateEvent('m', 'host-1', 'buzz', { latencyMs: 300 });
      transport.simulateEvent('m', 'me', 'buzz', { latencyMs: 100 }); // own echo
      transport.simulateEvent('m', 'host-1', 'select', { categoryIndex: 2, clueIndex: 4 });
      transport.simulateEvent('m', 'host-1', 'answer', { optionIndex: 1, thinkMs: 900 });
      transport.simulateEvent('m', 'host-1', 'wager', { kind: 'final', amount: 500 });

      expect(received).toEqual([
        { type: 'buzz', opponentId: 'host-1', latencyMs: 300 },
        { type: 'select', opponentId: 'host-1', categoryIndex: 2, clueIndex: 4 },
        { type: 'answer', opponentId: 'host-1', optionIndex: 1, thinkMs: 900 },
        { type: 'wager', opponentId: 'host-1', kind: 'final', amount: 500 },
      ]);
      provider.leave();
    });

    it('relays local actions as match events with the local uid', async () => {
      const { transport, provider } = await joinedGuest();
      provider.sendLocalBuzz(220);
      provider.sendLocalAnswer(3, 1100);
      provider.sendLocalWager('daily-double', 800);
      provider.sendLocalSelect(1, 2);
      await jest.advanceTimersByTimeAsync(0);

      const mine = transport.events.filter((e) => e.uid === 'me');
      expect(mine.map((e) => e.type)).toEqual(['buzz', 'answer', 'wager', 'select']);
      expect(mine[2].payload).toEqual({ kind: 'daily-double', amount: 800 });
      provider.leave();
    });

    it("delivers the host's state snapshots to onHostState, ignoring impostors", async () => {
      const { transport, provider } = await joinedGuest();
      const snapshots: Record<string, unknown>[] = [];
      provider.onHostState((s) => snapshots.push(s));

      transport.simulateEvent('m', 'host-1', 'state', { scores: { me: 200 } });
      transport.simulateEvent('m', 'someone-else', 'state', { scores: { me: 999999 } });

      expect(snapshots).toEqual([{ scores: { me: 200 } }]);
      provider.leave();
    });

    it('notifies onMatchEnded (host-left) when the host abandons the match', async () => {
      const { transport, provider } = await joinedGuest();
      const reasons: string[] = [];
      const leaves: OpponentEvent[] = [];
      provider.onMatchEnded((reason) => reasons.push(reason));
      provider.subscribe((e) => leaves.push(e));

      await transport.setStatus('m', 'abandoned', new Date().toISOString());

      expect(reasons).toEqual(['host-left']);
      expect(leaves).toEqual([{ type: 'leave', opponentId: 'host-1' }]);
      provider.leave();
    });
  });

  describe('host protocol', () => {
    async function hostWithGuest() {
      const transport = new FakeTransport();
      let beforeUnload: (() => void) | null = null;
      const provider = makeProvider(transport, {
        registerBeforeUnload: (fn) => {
          beforeUnload = fn;
          return () => (beforeUnload = null);
        },
      });
      const promise = provider.joinLobby(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(LOBBY_SEARCH_MS);
      await jest.advanceTimersByTimeAsync(0);
      const matchId = [...transport.matches.keys()][0];
      await transport.joinMatch(matchId, player('guest-9'), new Date().toISOString());
      await promise;
      return { transport, provider, matchId, fireBeforeUnload: () => beforeUnload?.() };
    }

    it('throttles state snapshots to one write per 250ms window (latest wins)', async () => {
      const { transport, provider, matchId } = await hostWithGuest();

      provider.publishState({ tick: 1 });
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.stateEventsFor(matchId)).toHaveLength(1);

      provider.publishState({ tick: 2 });
      provider.publishState({ tick: 3 });
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.stateEventsFor(matchId)).toHaveLength(1); // still throttled

      await jest.advanceTimersByTimeAsync(STATE_THROTTLE_MS);
      const states = transport.stateEventsFor(matchId);
      expect(states).toHaveLength(2);
      expect(states[1].payload).toEqual({ tick: 3 }); // coalesced to the latest

      provider.publishState({ tick: 4 });
      await jest.advanceTimersByTimeAsync(STATE_THROTTLE_MS);
      expect(transport.stateEventsFor(matchId)).toHaveLength(3);
      provider.leave();
    });

    it('abandons a live match on leave()', async () => {
      const { transport, provider, matchId } = await hostWithGuest();
      provider.markStarted();
      await jest.advanceTimersByTimeAsync(0);
      provider.leave();
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.matches.get(matchId)?.status).toBe('abandoned');
    });

    it('abandons a live match on beforeunload (best effort)', async () => {
      const { transport, matchId, fireBeforeUnload } = await hostWithGuest();
      fireBeforeUnload();
      await jest.advanceTimersByTimeAsync(0);
      expect(transport.matches.get(matchId)?.status).toBe('abandoned');
    });

    it('ignores publishState/markStarted from guests', async () => {
      const transport = new FakeTransport();
      transport.matches.set('m', openMatch('m', 'host-1'));
      const provider = makeProvider(transport);
      await provider.joinLobby(LOBBY_SEARCH_MS);

      provider.publishState({ tick: 1 });
      provider.markStarted();
      await jest.advanceTimersByTimeAsync(0);

      expect(transport.stateEventsFor('m')).toHaveLength(0);
      expect(transport.matches.get('m')?.status).toBe('open');
      provider.leave();
    });
  });
});
