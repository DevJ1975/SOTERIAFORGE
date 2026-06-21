import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { shouldSendStreakReminder } from '@assurance/shared';
import { db } from '../lib/admin';
import { notifyMember } from '../lib/notify';

/**
 * Behavior-triggered streak reminders (MO-11). Once a day, find members whose
 * streak is at risk — active on a previous UTC day, within the 7-day decay
 * window, not active yet today, and not already reminded today — and send a
 * single capped FCM nudge, stamping `lastStreakReminderAt` so the daily cap is
 * idempotent across retries/overlapping runs.
 *
 * The at-risk **selection + cap** decision is the pure, unit-tested
 * `shouldSendStreakReminder` (`@assurance/shared`). This scheduled wrapper — the
 * collection-group query, the `notifyMember` FCM send, and the Firestore stamp —
 * is integration code that is not headlessly verifiable.
 *
 * The narrow `streakDays > 0` prefilter (collection-group, needs the
 * `members.streakDays` COLLECTION_GROUP index) keeps the scan small; the precise
 * windowing/cap is then applied in memory.
 */
export const sendStreakReminders = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Etc/UTC' },
  async () => {
    const nowISO = new Date().toISOString();
    const snap = await db.collectionGroup('members').where('streakDays', '>', 0).get();

    let sent = 0;
    await Promise.all(
      snap.docs.map(async (doc) => {
        const member = {
          streakDays: doc.get('streakDays') as number | undefined,
          lastActiveAt: doc.get('lastActiveAt') as string | undefined,
          lastStreakReminderAt: doc.get('lastStreakReminderAt') as string | undefined,
        };
        if (!shouldSendStreakReminder(member, nowISO)) return;

        // members live at tenants/{tenantId}/members/{uid}.
        const tenantId = doc.ref.parent.parent?.id;
        if (!tenantId) return;
        const uid = doc.id;
        const days = member.streakDays ?? 0;

        await notifyMember(tenantId, uid, {
          title: 'Keep your streak alive 🔥',
          body: `You're on a ${days}-day streak — do a lesson today to keep it going!`,
          data: { type: 'streak_reminder', streakDays: String(days) },
        });
        // Stamp the cap regardless of FCM delivery so we never double-nudge today.
        await doc.ref.set({ lastStreakReminderAt: nowISO }, { merge: true });
        sent++;
      }),
    );

    logger.info('streak reminders run', { candidates: snap.size, sent });
  },
);
