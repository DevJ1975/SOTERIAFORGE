import { FakeGamificationDbPort } from './fakes';
import { onGameResultCreatedCore } from './on-game-result-created.core';

const NOW = '2026-06-11T12:00:00.000Z';

function result(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'res-1',
    uid: 'learner-1',
    tenantId: 'acme',
    game: 'hazard-hunter',
    score: 870,
    at: '2026-06-11T11:59:00.000Z',
    ...extra,
  };
}

function makeDb(): FakeGamificationDbPort {
  const db = new FakeGamificationDbPort();
  db.members.set('acme/learner-1', {
    uid: 'learner-1',
    tenantId: 'acme',
    role: 'learner',
    status: 'active',
    email: 'learner-1@acme.test',
    xp: 100,
    level: 2,
    streakDays: 0,
  });
  return db;
}

const base = { tenantId: 'acme', resultId: 'res-1' };

describe('onGameResultCreatedCore', () => {
  it('awards round(score/10) XP for hazard-hunter and stamps xpAwarded', async () => {
    const db = makeDb();
    const outcome = await onGameResultCreatedCore({ db }, { ...base, data: result() }, NOW);
    expect(outcome.action).toBe('awarded');
    expect(outcome.xpDelta).toBe(87);
    expect(db.xpEvents.get('acme/learner-1/game_res-1')).toEqual({
      id: 'game_res-1',
      uid: 'learner-1',
      tenantId: 'acme',
      amount: 87,
      reason: 'game_result',
      sourceRef: 'gameResults/res-1',
      at: NOW,
    });
    expect(db.members.get('acme/learner-1')).toMatchObject({
      xp: 187,
      level: 2,
      streakDays: 1,
      lastActiveAt: NOW,
      gamesPlayed: 1,
    });
    expect(db.gameResults.get('acme/res-1')).toEqual({ xpAwarded: 87 });
  });

  it('awards arcade-initiate on the first game result', async () => {
    const db = makeDb();
    const outcome = await onGameResultCreatedCore({ db }, { ...base, data: result() }, NOW);
    expect(outcome.badges).toEqual(['arcade-initiate']);
    expect(db.awards.get('acme/learner-1/arcade-initiate')).toMatchObject({
      badgeId: 'arcade-initiate',
      earnedAt: NOW,
    });
    const credential = db.awards.get('acme/learner-1/arcade-initiate')?.['credential'] as Record<
      string,
      unknown
    >;
    expect(credential['type']).toEqual(['VerifiableCredential', 'OpenBadgeCredential']);
    expect(credential['id']).toBe('https://soteriaforge.com/badges/acme/learner-1/arcade-initiate');
    expect(credential['issuer']).toMatchObject({ id: 'https://soteriaforge.com/issuer/acme' });
    expect(credential['validFrom']).toBe(NOW);
  });

  it('awards +150 and high-roller for a peril win', async () => {
    const db = makeDb();
    db.members.set('acme/learner-1', {
      ...(db.members.get('acme/learner-1') ?? {}),
      gamesPlayed: 4,
    });
    const outcome = await onGameResultCreatedCore(
      { db },
      { ...base, data: result({ game: 'peril', score: 1200, won: true }) },
      NOW,
    );
    expect(outcome.xpDelta).toBe(150);
    expect(outcome.badges).toEqual(['high-roller']);
    expect(db.members.get('acme/learner-1')).toMatchObject({ gamesPlayed: 5 });
  });

  it('awards +40 for a peril loss, with no high-roller', async () => {
    const db = makeDb();
    db.members.set('acme/learner-1', {
      ...(db.members.get('acme/learner-1') ?? {}),
      gamesPlayed: 4,
    });
    const outcome = await onGameResultCreatedCore(
      { db },
      { ...base, data: result({ game: 'peril', score: 300, won: false }) },
      NOW,
    );
    expect(outcome.xpDelta).toBe(40);
    expect(outcome.badges).toEqual([]);
  });

  it('is a noop when xpAwarded is already stamped (re-fire)', async () => {
    const db = makeDb();
    const outcome = await onGameResultCreatedCore(
      { db },
      { ...base, data: result({ xpAwarded: 87 }) },
      NOW,
    );
    expect(outcome.action).toBe('noop');
    expect(db.addXpEventCalls).toHaveLength(0);
    expect(db.setAwardCalls).toHaveLength(0);
    expect(db.updateGameResultCalls).toHaveLength(0);
  });

  it('does not double-credit XP when a duplicate delivery raced the stamp', async () => {
    const db = makeDb();
    await onGameResultCreatedCore({ db }, { ...base, data: result() }, NOW);
    const xpAfterFirst = db.members.get('acme/learner-1')?.['xp'];

    // Second delivery still sees the un-stamped doc, but the ledger entry exists.
    const second = await onGameResultCreatedCore({ db }, { ...base, data: result() }, NOW);
    expect(second.action).toBe('noop');
    expect(db.members.get('acme/learner-1')?.['xp']).toBe(xpAfterFirst);
    expect(db.addXpEventCalls).toHaveLength(1);
    expect(db.setAwardCalls.map((c) => c.badgeId)).toEqual(['arcade-initiate']);
    // The stamp is re-applied from the ledger entry.
    expect(db.gameResults.get('acme/res-1')).toEqual({ xpAwarded: 87 });
  });

  it('rejects docs that fail the gameResult schema without writing anything', async () => {
    const db = makeDb();
    for (const bad of [
      result({ game: 'pong' }),
      result({ score: -5 }),
      result({ score: 1.5 }),
      { id: 'res-1' },
      null,
    ]) {
      const outcome = await onGameResultCreatedCore({ db }, { ...base, data: bad }, NOW);
      expect(outcome.action).toBe('invalid');
    }
    expect(db.addXpEventCalls).toHaveLength(0);
    expect(db.updateGameResultCalls).toHaveLength(0);
  });

  it('skips when the member doc does not exist', async () => {
    const db = new FakeGamificationDbPort();
    const outcome = await onGameResultCreatedCore({ db }, { ...base, data: result() }, NOW);
    expect(outcome.action).toBe('skipped');
    expect(db.addXpEventCalls).toHaveLength(0);
    expect(db.members.size).toBe(0);
  });

  it('caps hazard-hunter XP at 150', async () => {
    const db = makeDb();
    const outcome = await onGameResultCreatedCore(
      { db },
      { ...base, data: result({ score: 99999 }) },
      NOW,
    );
    expect(outcome.xpDelta).toBe(150);
    expect(db.gameResults.get('acme/res-1')).toEqual({ xpAwarded: 150 });
  });
});
