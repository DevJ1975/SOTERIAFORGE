import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { db } from '../lib/admin';

/**
 * Clear one period board for every tenant by setting its `entries` to `[]`.
 * Period boards (`daily`/`weekly`) accumulate per-period XP deltas (see
 * `upsertLeaderboards`), so emptying them restarts the period from 0. The
 * `allTime` board is never reset.
 *
 * Integration code (Firestore tenant-iteration); the entry-merge math it relies
 * on is unit-tested in `lib/leaderboard.spec.ts`.
 */
async function resetPeriodBoards(period: 'daily' | 'weekly'): Promise<void> {
  const tenants = await db.collection('tenants').get();
  const nowISO = new Date().toISOString();
  await Promise.all(
    tenants.docs.map((t) =>
      db
        .doc(`tenants/${t.id}/leaderboard/${period}`)
        .set({ tenantId: t.id, period, entries: [], updatedAt: nowISO }, { merge: true }),
    ),
  );
  logger.info('leaderboard reset', { period, tenants: tenants.size });
}

/** Reset every tenant's daily leaderboard at 00:00 UTC. */
export const resetDailyLeaderboards = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Etc/UTC' },
  async () => {
    await resetPeriodBoards('daily');
  },
);

/** Reset every tenant's weekly leaderboard at 00:00 UTC every Monday. */
export const resetWeeklyLeaderboards = onSchedule(
  { schedule: '0 0 * * 1', timeZone: 'Etc/UTC' },
  async () => {
    await resetPeriodBoards('weekly');
  },
);
