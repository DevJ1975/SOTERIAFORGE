/**
 * Pure protocol tests for PERIL! realtime matches: lobby pick, deterministic
 * seeding, event (de)serialization round-trips, throttle math, avatars.
 * No firebase, no Phaser, no timers.
 */

import type { PerilMatch, PerilMatchEvent } from '@forge/shared';
import { createSeededRng } from './game-rules';
import { buildClueOptions, ROUND_ONE_CATEGORIES } from './peril-data';
import {
  LOBBY_HOST_WAIT_MS,
  LOBBY_SEARCH_MS,
  LocalMatchAction,
  STATE_THROTTLE_MS,
  avatarForUid,
  clueOptionSeed,
  finalOptionSeed,
  nextPublishDelay,
  opponentEventFrom,
  pickFreshestOpenMatch,
  serializeAction,
} from './match-protocol';

function match(overrides: Partial<PerilMatch>): PerilMatch {
  return {
    id: 'm1',
    tenantId: 'acme',
    hostUid: 'host-1',
    status: 'open',
    createdAt: '2026-06-11T12:00:00.000Z',
    players: [{ uid: 'host-1', displayName: 'Host', joinedAt: '2026-06-11T12:00:00.000Z' }],
    seed: 42,
    updatedAt: '2026-06-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('lobby timings (contract values)', () => {
  it('documents the scan/host-wait/throttle windows', () => {
    expect(LOBBY_SEARCH_MS).toBe(4000);
    expect(LOBBY_HOST_WAIT_MS).toBe(8000);
    expect(STATE_THROTTLE_MS).toBe(250);
  });
});

describe('pickFreshestOpenMatch', () => {
  it('picks the newest joinable open match', () => {
    const older = match({ id: 'old', createdAt: '2026-06-11T11:00:00.000Z' });
    const newer = match({ id: 'new', createdAt: '2026-06-11T11:30:00.000Z' });
    expect(pickFreshestOpenMatch([older, newer], 'me')?.id).toBe('new');
    expect(pickFreshestOpenMatch([newer, older], 'me')?.id).toBe('new');
  });

  it('skips own matches, full matches, non-open matches, and matches already joined', () => {
    const own = match({ id: 'own', hostUid: 'me' });
    const playing = match({ id: 'busy', status: 'playing' });
    const full = match({
      id: 'full',
      players: [
        { uid: 'a', displayName: 'A', joinedAt: '2026-06-11T11:00:00.000Z' },
        { uid: 'b', displayName: 'B', joinedAt: '2026-06-11T11:00:01.000Z' },
        { uid: 'c', displayName: 'C', joinedAt: '2026-06-11T11:00:02.000Z' },
      ],
    });
    const joined = match({
      id: 'joined',
      players: [
        { uid: 'host-1', displayName: 'Host', joinedAt: '2026-06-11T11:00:00.000Z' },
        { uid: 'me', displayName: 'Me', joinedAt: '2026-06-11T11:00:05.000Z' },
      ],
    });
    expect(pickFreshestOpenMatch([own, playing, full, joined], 'me')).toBeNull();
    const ok = match({ id: 'ok' });
    expect(pickFreshestOpenMatch([own, playing, full, ok], 'me')?.id).toBe('ok');
  });

  it('returns null for an empty floor', () => {
    expect(pickFreshestOpenMatch([], 'me')).toBeNull();
  });
});

describe('deterministic clue selection', () => {
  it('same seed ⇒ identical option order and correct index for every cell', () => {
    for (let cat = 0; cat < 3; cat++) {
      for (let row = 0; row < 5; row++) {
        const clue = ROUND_ONE_CATEGORIES[cat].clues[row];
        const a = buildClueOptions(clue, createSeededRng(clueOptionSeed(777, cat, row)));
        const b = buildClueOptions(clue, createSeededRng(clueOptionSeed(777, cat, row)));
        expect(a.options).toEqual(b.options);
        expect(a.correctIndex).toBe(b.correctIndex);
      }
    }
  });

  it('different seeds shuffle at least one cell differently', () => {
    const clue = ROUND_ONE_CATEGORIES[0].clues[0];
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      layouts.add(
        buildClueOptions(clue, createSeededRng(clueOptionSeed(seed, 0, 0))).options.join('|'),
      );
    }
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('derives distinct per-cell seeds from one match seed', () => {
    const seeds = new Set<number>();
    for (let cat = 0; cat < 6; cat++) {
      for (let row = 0; row < 5; row++) {
        seeds.add(clueOptionSeed(42, cat, row));
      }
    }
    seeds.add(finalOptionSeed(42));
    expect(seeds.size).toBe(31);
  });
});

describe('event serialization round-trip', () => {
  const wrap = (
    uid: string,
    body: { type: PerilMatchEvent['type']; payload: Record<string, unknown> },
  ): PerilMatchEvent => ({
    id: 'e1',
    matchId: 'm1',
    uid,
    at: '2026-06-11T12:00:00.000Z',
    ...body,
  });

  it('round-trips buzz, answer, wager, and select actions', () => {
    const actions: LocalMatchAction[] = [
      { kind: 'buzz', latencyMs: 412 },
      { kind: 'answer', optionIndex: 2, thinkMs: 1500 },
      { kind: 'wager', wagerKind: 'daily-double', amount: 800 },
      { kind: 'wager', wagerKind: 'final', amount: 1200 },
      { kind: 'select', categoryIndex: 3, clueIndex: 1 },
    ];
    const expected = [
      { type: 'buzz', opponentId: 'u2', latencyMs: 412 },
      { type: 'answer', opponentId: 'u2', optionIndex: 2, thinkMs: 1500 },
      { type: 'wager', opponentId: 'u2', kind: 'daily-double', amount: 800 },
      { type: 'wager', opponentId: 'u2', kind: 'final', amount: 1200 },
      { type: 'select', opponentId: 'u2', categoryIndex: 3, clueIndex: 1 },
    ];
    actions.forEach((action, i) => {
      expect(opponentEventFrom(wrap('u2', serializeAction(action)))).toEqual(expected[i]);
    });
  });

  it('returns null for state snapshots and malformed payloads', () => {
    expect(
      opponentEventFrom(wrap('host-1', { type: 'state', payload: { scores: {} } })),
    ).toBeNull();
    expect(opponentEventFrom(wrap('u2', { type: 'answer', payload: {} }))).toBeNull();
    expect(
      opponentEventFrom(wrap('u2', { type: 'answer', payload: { optionIndex: -1 } })),
    ).toBeNull();
    expect(
      opponentEventFrom(wrap('u2', { type: 'wager', payload: { kind: 'side-bet' } })),
    ).toBeNull();
    expect(
      opponentEventFrom(wrap('u2', { type: 'select', payload: { categoryIndex: 'x' } })),
    ).toBeNull();
  });

  it('defaults missing numeric extras instead of crashing', () => {
    expect(opponentEventFrom(wrap('u2', { type: 'buzz', payload: {} }))).toEqual({
      type: 'buzz',
      opponentId: 'u2',
      latencyMs: 0,
    });
  });
});

describe('host snapshot throttle (nextPublishDelay)', () => {
  it('publishes immediately when outside the window', () => {
    expect(nextPublishDelay(Number.NEGATIVE_INFINITY, 1000)).toBe(0);
    expect(nextPublishDelay(1000, 1250)).toBe(0);
    expect(nextPublishDelay(1000, 2000)).toBe(0);
  });

  it('returns the remaining wait inside the window', () => {
    expect(nextPublishDelay(1000, 1000)).toBe(250);
    expect(nextPublishDelay(1000, 1100)).toBe(150);
    expect(nextPublishDelay(1000, 1249)).toBe(1);
  });

  it('honors a custom interval', () => {
    expect(nextPublishDelay(1000, 1400, 1000)).toBe(600);
  });
});

describe('avatarForUid', () => {
  it('is deterministic (same uid ⇒ same avatar on every client)', () => {
    expect(avatarForUid('learner-1')).toEqual(avatarForUid('learner-1'));
  });

  it('produces renderer-compatible parameters', () => {
    for (const uid of ['a', 'learner-1', 'zZ9-quite-long-uid-string']) {
      const avatar = avatarForUid(uid);
      expect(avatar.hairStyle).toBeGreaterThanOrEqual(0);
      expect(avatar.hairStyle).toBeLessThan(4);
      expect(typeof avatar.glasses).toBe('boolean');
      expect(avatar.faceColor).toBeGreaterThan(0);
      expect(avatar.shirtColor).toBeGreaterThan(0);
    }
  });
});
