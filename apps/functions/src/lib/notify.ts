import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';

/**
 * Queue a transactional email by writing to the `mail` collection consumed by
 * the Firebase "Trigger Email" extension (configured at deploy with an SMTP/
 * SendGrid provider). No mail credentials live in code.
 */
export async function queueEmail(to: string, subject: string, html: string): Promise<void> {
  await db
    .collection('mail')
    .add({ to, message: { subject, html }, createdAt: new Date().toISOString() });
}

/**
 * Send an FCM push to a member's registered devices (best-effort). Prunes tokens
 * that the messaging service reports as invalid.
 */
export async function notifyMember(
  tenantId: string,
  uid: string,
  notification: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const ref = db.doc(`tenants/${tenantId}/members/${uid}`);
  const tokens = ((await ref.get()).get('fcmTokens') as string[] | undefined) ?? [];
  if (tokens.length === 0) return;

  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    });
    const invalid = res.responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter((t): t is string => !!t);
    if (invalid.length) {
      const remaining = tokens.filter((t) => !invalid.includes(t));
      await ref.set({ fcmTokens: remaining }, { merge: true });
    }
  } catch (err) {
    logger.warn('notifyMember failed', { tenantId, uid, error: (err as Error).message });
  }
}
