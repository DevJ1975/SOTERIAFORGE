import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { signToken, nowPlusSeconds } from './token';

const CMI5_SECRET = defineSecret('CMI5_SIGNING_SECRET');
/** Base URL where the cmi5 HTTP functions (xapi, cmi5Fetch) are reachable. */
const FUNCTIONS_BASE_URL = defineString('FUNCTIONS_BASE_URL', {
  default: 'https://us-central1-soteria-forge.cloudfunctions.net',
});

const launchInput = z.object({
  activityId: z.string().min(1),
  /** The AU launch URL (Unity WebGL index.html or a cmi5 AU). */
  auUrl: z.string().url(),
});

/**
 * Issue cmi5 launch parameters for an external AU (e.g. a Unity WebGL build).
 * Returns the standard cmi5 params; the AU calls `fetch` once to exchange the
 * short-lived fetch token for an auth token, then POSTs xAPI to `endpoint` with
 * that token. Everything is scoped to the caller's tenant.
 */
export const launchCmi5 = onCall({ secrets: [CMI5_SECRET] }, async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const tenantId = caller.token['tenantId'] as string | undefined;
  if (!tenantId) throw new HttpsError('failed-precondition', 'No tenant scope on caller.');

  const { activityId, auUrl } = launchInput.parse(request.data);
  const registration = randomUUID();
  const secret = CMI5_SECRET.value();
  const base = FUNCTIONS_BASE_URL.value();

  const fetchToken = signToken(
    {
      t: tenantId,
      u: caller.uid,
      r: registration,
      a: activityId,
      k: 'fetch',
      exp: nowPlusSeconds(300),
    },
    secret,
  );

  return {
    auUrl,
    endpoint: `${base}/xapi`,
    fetch: `${base}/cmi5Fetch?token=${encodeURIComponent(fetchToken)}`,
    actor: {
      objectType: 'Agent',
      account: { homePage: 'https://soteriaforge.com', name: caller.uid },
    },
    registration,
    activityId,
  };
});
