import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../lib/admin';

const tokenInput = z.object({ token: z.string().min(1), remove: z.boolean().optional() });

/**
 * Register (or remove) the caller's FCM device token on their own member doc so
 * the backend can push assignment/streak/badge notifications. Self-service:
 * a user only ever mutates their own token list, in their own tenant.
 */
export const registerFcmToken = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const tenantId = caller.token['tenantId'] as string | undefined;
  if (!tenantId) throw new HttpsError('failed-precondition', 'No tenant scope on caller.');

  const { token, remove } = tokenInput.parse(request.data);
  await db
    .doc(`tenants/${tenantId}/members/${caller.uid}`)
    .set(
      { fcmTokens: remove ? FieldValue.arrayRemove(token) : FieldValue.arrayUnion(token) },
      { merge: true },
    );
  return { ok: true };
});
