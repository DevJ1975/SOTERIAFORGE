// Firestore REST helpers (emulator + prod identical surface).
//
// Writes `events` documents at the CONTRACT path
//   tenants/{t}/courses/{c}/enrollments/{u}/events/{idempotencyKey}
// and reads enrollment docs, all under `Authorization: Bearer <idToken>` so the
// real security rules (firestore.rules) evaluate every request — exactly the
// path the learner browser SDK takes.
//
// REST surface (Firestore v1 REST), unchanged emulator↔prod:
//   PATCH {FIRESTORE_BASE_URL}/{documentPath}    ← upsert a document by id
//   GET   {FIRESTORE_BASE_URL}/{documentPath}    ← read a document
// Writing by full document id (PATCH on the doc path) is the idempotent upsert
// that makes a replay collapse onto the same doc id.
//
// k6 ES module.

import http from 'k6/http';
import { check } from 'k6';
import { FIRESTORE_BASE_URL, eventDocPath, enrollmentDocPath } from '../config.js';

/** Bearer-auth JSON headers for a learner's ID token. */
function authHeaders(idToken) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };
}

// ---------------------------------------------------------------------------
// Firestore REST <-> JS value mapping (typed-value envelope).
// ---------------------------------------------------------------------------

/** Encode a plain JS value into a Firestore REST typed `Value`. */
export function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  if (typeof v === 'object') {
    const fields = {};
    for (const k of Object.keys(v)) fields[k] = toFirestoreValue(v[k]);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

/** Decode a Firestore REST typed `Value` back into a plain JS value. */
export function fromFirestoreValue(val) {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue.fields || {});
  }
  return undefined;
}

/** Decode a Firestore `fields` map into a plain object. */
export function fromFirestoreFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
  return out;
}

/** Encode a plain object into a Firestore `fields` map. */
export function toFirestoreFields(obj) {
  const fields = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) continue; // never send undefined
    fields[k] = toFirestoreValue(obj[k]);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Writes / reads
// ---------------------------------------------------------------------------

/**
 * Idempotent upsert of one progress event at the contract path. The doc id IS
 * the idempotencyKey, so a verbatim re-send (same key) re-writes the same doc
 * and collapses. Returns the k6 response.
 */
export function writeEvent(idToken, event) {
  const path = eventDocPath(event.tenantId, event.courseId, event.uid, event.idempotencyKey);
  const url = `${FIRESTORE_BASE_URL}/${path}`;
  const body = JSON.stringify({ fields: toFirestoreFields(event) });
  const res = http.patch(url, body, {
    headers: authHeaders(idToken),
    tags: { name: 'firestore:writeEvent' },
  });
  check(res, {
    'firestore: event written (200)': (r) => r.status === 200,
  });
  return res;
}

/** Read one enrollment document. Returns { status, data | null }. */
export function readEnrollment(idToken, tenantId, courseId, uid) {
  const url = `${FIRESTORE_BASE_URL}/${enrollmentDocPath(tenantId, courseId, uid)}`;
  const res = http.get(url, {
    headers: authHeaders(idToken),
    tags: { name: 'firestore:readEnrollment' },
  });
  if (res.status !== 200) return { status: res.status, data: null };
  let data = null;
  try {
    const parsed = res.json();
    data = parsed && parsed.fields ? fromFirestoreFields(parsed.fields) : null;
  } catch (_e) {
    data = null;
  }
  return { status: res.status, data };
}
