// GCIP / Identity Platform emulator REST helpers.
//
// Mints Firebase ID tokens against the Auth emulator (:9099) so the Firestore
// REST writes can carry `Authorization: Bearer <idToken>` and be evaluated by
// the real security rules (firestore.rules) — the same code path a learner's
// browser SDK would take.
//
// REST surface (identitytoolkit v1), unchanged between emulator and prod:
//   POST {AUTH_BASE_URL}/accounts:signUp?key={WEB_API_KEY}
//   POST {AUTH_BASE_URL}/accounts:signInWithPassword?key={WEB_API_KEY}
// The emulator accepts any non-empty `key`. See config.js for the base URL.
//
// k6 ES module: uses k6's `http` + `check`.

import http from 'k6/http';
import { check } from 'k6';
import { AUTH_BASE_URL, WEB_API_KEY } from '../config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Create a new account. Returns the parsed body ({ idToken, localId, ... }) or
 * the error body when the email already exists (caller falls back to sign-in).
 */
export function signUp(email, password) {
  const url = `${AUTH_BASE_URL}/accounts:signUp?key=${WEB_API_KEY}`;
  const res = http.post(
    url,
    JSON.stringify({ email, password, returnSecureToken: true }),
    { headers: JSON_HEADERS, tags: { name: 'auth:signUp' } },
  );
  return { status: res.status, body: safeJson(res) };
}

/** Sign in with email + password. Returns { status, body: { idToken, localId } }. */
export function signInWithPassword(email, password) {
  const url = `${AUTH_BASE_URL}/accounts:signInWithPassword?key=${WEB_API_KEY}`;
  const res = http.post(
    url,
    JSON.stringify({ email, password, returnSecureToken: true }),
    { headers: JSON_HEADERS, tags: { name: 'auth:signInWithPassword' } },
  );
  return { status: res.status, body: safeJson(res) };
}

/**
 * Ensure an account exists and return an authenticated session for it. Tries
 * sign-up first; if the email is already registered, falls back to sign-in so
 * re-runs against a warm emulator reuse the same uid (keeps the run idempotent).
 *
 * Returns { uid, idToken } on success, or null on failure (the caller checks).
 */
export function ensureSession(email, password) {
  let res = signUp(email, password);
  if (res.status !== 200) {
    // EMAIL_EXISTS (or similar) → sign in to the existing account.
    res = signInWithPassword(email, password);
  }
  const ok = check(res, {
    'auth: session minted': (r) => r.status === 200 && !!r.body && !!r.body.idToken,
  });
  if (!ok) return null;
  return { uid: res.body.localId, idToken: res.body.idToken };
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_e) {
    return null;
  }
}
