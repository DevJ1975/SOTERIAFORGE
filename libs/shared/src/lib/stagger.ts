/**
 * Framework-free client-spreading + retry primitives for the thundering-herd
 * hardening. No Angular / Firebase / Capacitor imports — pure TS so it runs in
 * the browser, on a worker, on the server (SSR), and under Jest's `node` env.
 */

const DEVICE_ID_STORAGE_KEY = 'forge.deviceId';

/** Cached per-process device id when no persistent store is available. */
let memoizedDeviceId: string | undefined;

/**
 * Returns a stable device id, persisted in `localStorage` when available and
 * cached in-process otherwise. SSR / no-`window` safe: never throws.
 */
export function deviceId(): string {
  const store = safeLocalStorage();
  if (store) {
    try {
      const existing = store.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing) {
        return existing;
      }
      const generated = generateDeviceId();
      store.setItem(DEVICE_ID_STORAGE_KEY, generated);
      return generated;
    } catch {
      // Fall through to the in-process cache (e.g. storage disabled/full).
    }
  }
  if (!memoizedDeviceId) {
    memoizedDeviceId = generateDeviceId();
  }
  return memoizedDeviceId;
}

function safeLocalStorage(): Storage | undefined {
  try {
    if (typeof globalThis !== 'undefined') {
      const candidate = (globalThis as { localStorage?: Storage }).localStorage;
      if (candidate && typeof candidate.getItem === 'function') {
        return candidate;
      }
    }
  } catch {
    // Accessing localStorage can throw in sandboxed contexts.
  }
  return undefined;
}

function generateDeviceId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // Non-crypto fallback; uniqueness is sufficient for a device tag.
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Deterministic hash of `id` spread into `[0, windowMs)`. The same id always
 * yields the same delay, so a device's burst lands at a stable offset and the
 * fleet fans out across the window instead of arriving together.
 */
export function staggerDelayMs(id: string, windowMs: number): number {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return 0;
  }
  // FNV-1a 32-bit, kept unsigned via `>>> 0`.
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return unsigned % Math.floor(windowMs);
}

/** Tunables for {@link backoff} and {@link withRetry}. */
export interface RetryOptions {
  /** Max attempts including the first try. Default 5. */
  attempts?: number;
  /** Base delay in ms for attempt 0. Default 250. */
  baseMs?: number;
  /** Hard cap on any single backoff delay. Default 30_000. */
  maxMs?: number;
  /** Override the random source (0..1); injected for deterministic tests. */
  random?: () => number;
  /** Override the sleeper; injected so specs run without real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_MS = 250;
const DEFAULT_MAX_MS = 30_000;
const DEFAULT_ATTEMPTS = 5;

/**
 * Exponential backoff with FULL jitter: `random() * min(maxMs, baseMs * 2^attempt)`.
 * `attempt` is 0-based (0 = first retry delay).
 */
export function backoff(attempt: number, opts: RetryOptions = {}): number {
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const random = opts.random ?? Math.random;
  const exp = Math.max(0, Math.floor(attempt));
  const ceiling = Math.min(maxMs, baseMs * 2 ** exp);
  return Math.floor(random() * ceiling);
}

/** Error codes/messages we treat as transient and worth retrying. */
const RETRYABLE_TOKENS = ['too-many-requests', 'unavailable', 'deadline-exceeded'] as const;
const RETRYABLE_STATUS = new Set([408, 429]);

/**
 * Classifies an unknown error as transient/retryable by inspecting a numeric
 * `status`/`code`/`statusCode` (408, 429) or a string code/message containing a
 * retryable token (`too-many-requests`, `unavailable`, `deadline-exceeded`).
 */
export function isRetryable(err: unknown): boolean {
  if (err == null) {
    return false;
  }
  const record = typeof err === 'object' ? (err as Record<string, unknown>) : undefined;

  const numbers = [record?.['status'], record?.['statusCode'], record?.['code']];
  for (const value of numbers) {
    if (typeof value === 'number' && RETRYABLE_STATUS.has(value)) {
      return true;
    }
  }

  const haystacks = [
    typeof record?.['code'] === 'string' ? (record['code'] as string) : undefined,
    typeof record?.['message'] === 'string' ? (record['message'] as string) : undefined,
    typeof err === 'string' ? err : undefined,
  ];
  for (const raw of haystacks) {
    if (!raw) {
      continue;
    }
    const text = raw.toLowerCase();
    if (text.includes('429') || text.includes('408')) {
      return true;
    }
    if (RETRYABLE_TOKENS.some((token) => text.includes(token))) {
      return true;
    }
  }
  return false;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying only on retryable errors (see {@link isRetryable}) with
 * full-jitter {@link backoff} between attempts. Non-retryable errors and the
 * final attempt's error are rethrown. Inject `sleep`/`random` for fast,
 * deterministic specs.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);
  const sleep = opts.sleep ?? realSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts - 1;
      if (isLast || !isRetryable(err)) {
        throw err;
      }
      await sleep(backoff(attempt, opts));
    }
  }
  // Unreachable: the loop either returns or throws, but keeps the types happy.
  throw lastError;
}
