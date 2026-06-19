/**
 * Standalone server-side retry with exponential backoff + full jitter.
 *
 * This is the functions-runtime sibling of `@forge/shared`'s `withRetry`: the
 * functions project bundles for Node and cannot cleanly pull the browser shared
 * bundle's runtime utils, so we keep a small independent copy here. Retries are
 * deliberately narrow — only *transient* downstream failures (UNAVAILABLE,
 * DEADLINE_EXCEEDED, 429/too-many-requests) are retried; everything else
 * (permission, not-found, invalid-argument, programmer errors) fails fast.
 */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  retries?: number;
  /** Base delay in ms; attempt N waits up to base * 2^(N-1). Default 100. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff delay, in ms. Default 2000. */
  maxDelayMs?: number;
  /** Override the transient classifier (e.g. for tests). */
  isTransient?: (err: unknown) => boolean;
  /** Injectable sleep (tests pass a no-op). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG in [0,1) for jitter (tests pass a fixed value). */
  random?: () => number;
}

// Note: 'resource-exhausted' is deliberately NOT transient here — it is the
// status our own token-bucket limiter raises, and retrying it would silently
// burn the caller's budget. Firestore quota exhaustion is rare and not safely
// retryable on a tight callable budget.
const TRANSIENT_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'deadline_exceeded',
  'aborted',
  'too-many-requests',
]);

/**
 * Best-effort classification of a downstream error as transient/retryable.
 * Recognizes gRPC/Firestore status codes (numeric + string), HTTP 429/503/504,
 * and common transient network errno strings.
 */
export function isTransientError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { code?: unknown; status?: unknown; message?: unknown };

  // String status codes (firebase-admin / functions): 'unavailable', etc.
  if (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code.toLowerCase())) return true;

  // Numeric gRPC codes: 14 = UNAVAILABLE, 4 = DEADLINE_EXCEEDED, 10 = ABORTED.
  // (8 = RESOURCE_EXHAUSTED is intentionally excluded; see TRANSIENT_CODES.)
  if (typeof e.code === 'number' && [4, 10, 14].includes(e.code)) return true;

  // HTTP-ish statuses.
  const status = typeof e.status === 'number' ? e.status : undefined;
  if (status === 429 || status === 503 || status === 504) return true;

  // Network errnos.
  if (typeof e.code === 'string') {
    const c = e.code.toUpperCase();
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(c)) return true;
  }

  return false;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying on transient failures with exponential backoff + full
 * jitter. Non-transient errors propagate immediately. After the final attempt
 * the last error is rethrown.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const transient = opts.isTransient ?? isTransientError;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !transient(err)) throw err;
      // Full jitter: sleep a random amount in [0, min(cap, base * 2^(attempt-1))].
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.floor(random() * ceiling));
    }
  }
  throw lastErr;
}
