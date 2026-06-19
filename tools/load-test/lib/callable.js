// Callable Cloud Functions REST helper (emulator + prod identical surface).
//
// Firebase v2 `onCall` functions (apps/functions/src/main.ts) speak the callable
// protocol over plain HTTPS:
//   POST {FUNCTIONS_BASE_URL}/{project}/{region}/{fn}
//   body:   { "data": <payload> }
//   header: Authorization: Bearer <idToken>   (optional; required by guarded fns)
//   200:    { "result": <value> }
//   error:  { "error": { "status": "...", "message": "..." } }
//
// Used by scenarios/sync-storm.js to exercise rate-limit / backpressure paths
// (the Lane D rate-limit core surfaces `resource-exhausted` / HTTP 429, which the
// client treats as retryable per the @forge/shared backoff contract).
//
// k6 ES module.

import http from 'k6/http';
import { FUNCTIONS_BASE_URL, FUNCTIONS_REGION, PROJECT_ID } from '../config.js';

/** Build the callable endpoint URL for a function name. */
export function callableUrl(fnName) {
  return `${FUNCTIONS_BASE_URL}/${PROJECT_ID}/${FUNCTIONS_REGION}/${fnName}`;
}

/**
 * Invoke a callable function. Returns:
 *   { status, result, error, retryable }
 * where `retryable` is true for the backpressure signals the @forge/shared
 * retry policy retries on (429 / resource-exhausted / unavailable /
 * deadline-exceeded).
 */
export function callFunction(fnName, data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = http.post(callableUrl(fnName), JSON.stringify({ data: data || {} }), {
    headers,
    tags: { name: `callable:${fnName}` },
  });

  let result;
  let error;
  try {
    const body = res.json();
    result = body && body.result;
    error = body && body.error;
  } catch (_e) {
    /* non-JSON (e.g. raw 429 from the runtime) */
  }

  const statusStr = error && error.status ? String(error.status) : '';
  const retryable =
    res.status === 429 ||
    res.status === 408 ||
    res.status === 503 ||
    statusStr === 'resource-exhausted' ||
    statusStr === 'unavailable' ||
    statusStr === 'deadline-exceeded' ||
    statusStr === 'too-many-requests';

  return { status: res.status, result, error, retryable };
}
