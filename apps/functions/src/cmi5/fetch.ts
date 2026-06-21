import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from '../lib/admin';
import { signToken, verifyToken, nowPlusSeconds } from './token';

const CMI5_SECRET = defineSecret('CMI5_SIGNING_SECRET');

/**
 * cmi5 fetch-URL endpoint. The AU calls this once at launch with its one-time
 * `fetch` token; we return the cmi5-spec `{ "auth-token": ... }`. The auth token
 * is a longer-lived signed token (same tenant/uid/registration scope) the AU
 * then uses as the Bearer credential when POSTing xAPI to `/xapi`.
 *
 * The cmi5 spec requires the fetch token to be exchanged exactly once. We record
 * the consumed registration in `cmi5Fetches/{registration}` via `create()`
 * (fails if it already exists), so a replayed fetch token cannot mint a second
 * auth token even inside its TTL window.
 */
export const cmi5Fetch = onRequest({ secrets: [CMI5_SECRET], cors: true }, async (req, res) => {
  const token = String(req.query['token'] ?? '');
  const secret = CMI5_SECRET.value();
  const payload = token ? verifyToken(token, secret) : null;

  if (!payload || payload.k !== 'fetch') {
    // cmi5 spec: errors are returned with an "error-text" field.
    res.status(401).json({ 'error-text': 'Invalid or expired fetch token.' });
    return;
  }

  // Enforce single-use: claim the registration; a second exchange fails.
  try {
    await db.doc(`cmi5Fetches/${payload.r}`).create({
      tenantId: payload.t,
      uid: payload.u,
      activityId: payload.a,
      consumedAt: new Date().toISOString(),
    });
  } catch {
    res.status(401).json({ 'error-text': 'Fetch token already used.' });
    return;
  }

  const authToken = signToken({ ...payload, k: 'auth', exp: nowPlusSeconds(60 * 60 * 4) }, secret);
  res.status(200).json({ 'auth-token': authToken });
});
