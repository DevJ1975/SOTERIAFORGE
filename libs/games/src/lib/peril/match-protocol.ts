/**
 * Pure multiplayer protocol logic for PERIL! realtime matches — no firebase
 * and no Phaser imports (Jest/jsdom friendly).
 *
 * Covers lobby decisions (which open match to join), deterministic seeding
 * (same match seed ⇒ identical boards and option shuffles on every client),
 * match-event (de)serialization, host snapshot throttling, and procedural
 * avatars for human players.
 */

import type { PerilMatch, PerilMatchEvent, PerilMatchEventType } from '@forge/shared';
import { PERIL_MATCH_MAX_PLAYERS } from '@forge/shared';
import type { OpponentAvatar, OpponentEvent } from './opponent-provider';

// ---- Lobby timings ----------------------------------------------------------

/** How long joinLobby searches for an open match before hosting one. */
export const LOBBY_SEARCH_MS = 4000;
/** How often the open-match query is retried during the search window. */
export const LOBBY_POLL_MS = 1500;
/** How long a freshly created match waits for joiners before the AI fallback. */
export const LOBBY_HOST_WAIT_MS = 8000;
/** 'Starting in 3…' countdown once human seats fill. */
export const LOBBY_COUNTDOWN_MS = 3000;
/** Minimum interval between host 'state' snapshot publishes. */
export const STATE_THROTTLE_MS = 250;

// ---- Lobby decision -----------------------------------------------------------

/**
 * Picks the freshest (newest createdAt) open match the player can join:
 * not their own, not full, not already joined. Returns null when nothing
 * is joinable — the caller should host a new match instead.
 */
export function pickFreshestOpenMatch(
  matches: readonly PerilMatch[],
  selfUid: string,
): PerilMatch | null {
  const joinable = matches.filter(
    (m) =>
      m.status === 'open' &&
      m.hostUid !== selfUid &&
      m.players.length < PERIL_MATCH_MAX_PLAYERS &&
      !m.players.some((p) => p.uid === selfUid),
  );
  if (joinable.length === 0) return null;
  return joinable.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

// ---- Deterministic seeding ------------------------------------------------------

/**
 * Derives a stable per-clue rng seed from the match seed and the cell, so
 * every client shuffles a clue's options identically regardless of the order
 * cells are played in. (Use with createSeededRng + buildClueOptions.)
 */
export function clueOptionSeed(
  matchSeed: number,
  categoryIndex: number,
  clueIndex: number,
): number {
  let h = (matchSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (categoryIndex + 1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ ((clueIndex + 1) << 4), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The per-clue seed reserved for the Final PERIL! option shuffle. */
export function finalOptionSeed(matchSeed: number): number {
  return clueOptionSeed(matchSeed, 97, 31);
}

// ---- Event (de)serialization ----------------------------------------------------

/** A local player action, before it is stamped with uid/at/ids. */
export type LocalMatchAction =
  | { kind: 'buzz'; latencyMs: number }
  | { kind: 'answer'; optionIndex: number; thinkMs: number }
  | { kind: 'wager'; wagerKind: 'daily-double' | 'final'; amount: number }
  | { kind: 'select'; categoryIndex: number; clueIndex: number };

/** Serializes a local action into the match-event wire shape. */
export function serializeAction(action: LocalMatchAction): {
  type: PerilMatchEventType;
  payload: Record<string, unknown>;
} {
  switch (action.kind) {
    case 'buzz':
      return { type: 'buzz', payload: { latencyMs: action.latencyMs } };
    case 'answer':
      return {
        type: 'answer',
        payload: { optionIndex: action.optionIndex, thinkMs: action.thinkMs },
      };
    case 'wager':
      return { type: 'wager', payload: { kind: action.wagerKind, amount: action.amount } };
    case 'select':
      return {
        type: 'select',
        payload: { categoryIndex: action.categoryIndex, clueIndex: action.clueIndex },
      };
  }
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Deserializes a remote match event into the OpponentEvent the scenes consume.
 * Returns null for 'state' snapshots (handled separately) and malformed
 * payloads, so a buggy or hostile client can never crash the local game.
 */
export function opponentEventFrom(event: PerilMatchEvent): OpponentEvent | null {
  const { uid, type, payload } = event;
  switch (type) {
    case 'buzz':
      return { type: 'buzz', opponentId: uid, latencyMs: asNumber(payload['latencyMs']) };
    case 'answer': {
      const optionIndex = payload['optionIndex'];
      if (typeof optionIndex !== 'number' || !Number.isInteger(optionIndex) || optionIndex < 0) {
        return null;
      }
      return {
        type: 'answer',
        opponentId: uid,
        optionIndex,
        thinkMs: asNumber(payload['thinkMs']),
      };
    }
    case 'wager': {
      const kind = payload['kind'];
      if (kind !== 'daily-double' && kind !== 'final') return null;
      return { type: 'wager', opponentId: uid, kind, amount: asNumber(payload['amount']) };
    }
    case 'select': {
      const categoryIndex = payload['categoryIndex'];
      const clueIndex = payload['clueIndex'];
      if (typeof categoryIndex !== 'number' || typeof clueIndex !== 'number') return null;
      return { type: 'select', opponentId: uid, categoryIndex, clueIndex };
    }
    case 'state':
      return null;
  }
}

// ---- Host snapshot throttle -------------------------------------------------------

/**
 * How long to wait before the next 'state' publish: 0 means "publish now",
 * a positive value is the remaining throttle window in milliseconds.
 */
export function nextPublishDelay(
  lastPublishedAt: number,
  now: number,
  minIntervalMs: number = STATE_THROTTLE_MS,
): number {
  return Math.max(0, lastPublishedAt + minIntervalMs - now);
}

// ---- Procedural avatars for humans ---------------------------------------------------

const FACE_TONES = [0xf2c9a0, 0xd9a06b, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRT_TONES = [0xe05c4b, 0x2f7d4f, 0x355070, 0x6d597a, 0xb56576, 0x1473e6];
const HAIR_TONES = [0x2b2b2b, 0x6b3b1f, 0xb55239, 0xd6b85a];

/** Small deterministic string hash (FNV-1a) for avatar derivation. */
export function hashUid(uid: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic procedural avatar for a human player (same on all clients). */
export function avatarForUid(uid: string): OpponentAvatar {
  const h = hashUid(uid);
  return {
    faceColor: FACE_TONES[h % FACE_TONES.length],
    shirtColor: SHIRT_TONES[(h >>> 3) % SHIRT_TONES.length],
    hairStyle: (h >>> 7) % 4,
    hairColor: HAIR_TONES[(h >>> 11) % HAIR_TONES.length],
    glasses: ((h >>> 15) & 1) === 1,
  };
}
