import { gameResult } from '@forge/shared';
import type { PlatformBadgeId } from '@forge/shared';
import { persistEarnedBadges } from './badge-credential';
import type { GamificationDbPort } from './ports';
import { applyGamificationEvent, memberStateOf, stateAfter } from './xp-engine.core';

/**
 * Pure core for the gameResults onDocumentCreated trigger
 * (tenants/{tenantId}/gameResults/{resultId} — created by the player's own
 * client, validated structurally by firestore.rules and fully by the shared
 * gameResult schema here).
 *
 * Runs the XP engine over the result, persists the member counters, the XP
 * ledger entry and any badge awards, then stamps `xpAwarded` back onto the
 * result doc.
 *
 * Idempotence story (triggers can re-fire):
 *  1. `xpAwarded` already set on the doc -> the result was processed, no-op.
 *  2. Deterministic ledger id (game_{resultId}) — when the ledger entry
 *     already exists (duplicate delivery racing the stamp), XP is not credited
 *     again; the stamp is simply re-applied.
 *  3. Badge awards are existence-checked before writing (persistEarnedBadges).
 */

export interface GameResultCreatedEvent {
  tenantId: string;
  resultId: string;
  data: unknown;
}

export interface GameResultGamificationResult {
  action: 'noop' | 'invalid' | 'skipped' | 'awarded';
  xpDelta: number;
  badges: PlatformBadgeId[];
}

export async function onGameResultCreatedCore(
  deps: { db: GamificationDbPort },
  event: GameResultCreatedEvent,
  now: string = new Date().toISOString(),
): Promise<GameResultGamificationResult> {
  const parsed = gameResult.safeParse(event.data);
  if (!parsed.success) {
    // Malformed result (rules only check shallowly): never award, never retry.
    return { action: 'invalid', xpDelta: 0, badges: [] };
  }
  const result = parsed.data;
  const { tenantId, resultId } = event;

  if (result.xpAwarded !== undefined) {
    // Already processed (the stamp doubles as the idempotence marker).
    return { action: 'noop', xpDelta: 0, badges: [] };
  }

  const member = await deps.db.getMember(tenantId, result.uid);
  if (!member) {
    // No member doc: never create a partial one from a game result.
    return { action: 'skipped', xpDelta: 0, badges: [] };
  }

  const eventId = `game_${resultId}`.replace(/\//g, '_');
  const sourceRef = `gameResults/${resultId}`;

  const existing = await deps.db.getXpEvent(tenantId, result.uid, eventId);
  if (existing) {
    // Duplicate delivery that raced the stamp: re-stamp from the ledger entry
    // without crediting XP twice.
    const amount = typeof existing['amount'] === 'number' ? existing['amount'] : 0;
    await deps.db.updateGameResult(tenantId, resultId, { xpAwarded: amount });
    return { action: 'noop', xpDelta: 0, badges: [] };
  }

  const engineResult = applyGamificationEvent(
    memberStateOf(member),
    {
      kind: 'game',
      game: result.game,
      score: result.score,
      ...(result.won !== undefined ? { won: result.won } : {}),
      sourceRef,
    },
    now,
  );

  const draft = engineResult.xpEvents[0];
  await deps.db.addXpEvent(tenantId, result.uid, eventId, {
    id: eventId,
    uid: result.uid,
    tenantId,
    ...draft,
  });

  const state = stateAfter(engineResult, now);
  await deps.db.setMember(tenantId, result.uid, {
    xp: state.xp,
    level: state.level,
    streakDays: state.streakDays,
    lastActiveAt: now,
    // Server-side bookkeeping counter (not in the client member schema).
    gamesPlayed: state.gamesPlayed,
  });

  const awarded = await persistEarnedBadges(
    deps.db,
    tenantId,
    result.uid,
    engineResult.badgesEarned,
    now,
  );

  await deps.db.updateGameResult(tenantId, resultId, { xpAwarded: engineResult.xpDelta });

  return { action: 'awarded', xpDelta: engineResult.xpDelta, badges: awarded };
}
