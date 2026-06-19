import { FunctionsDomainError } from './errors';
import type { RateLimitPort } from './ports';

/**
 * Firestore-backed token-bucket rate limiter at `/rateLimits/{key}` (key =
 * `actorUid`). Each call to `takeToken` runs a transaction that:
 *   1. reads the stored bucket state (`{ tokens, updatedAt }`),
 *   2. refills based on elapsed wall-clock time (`refillPerSec`, capped at
 *      `capacity`),
 *   3. consumes one token if available, else throws `resource-exhausted`.
 *
 * `/rateLimits` is Admin-SDK-only (clients are denied by the deny-by-default
 * catch-all rule), so only Cloud Functions ever mutate buckets — no rules change.
 *
 * The refill math is pure and lives in `refill()`; the transaction wiring is in
 * the adapter/fake behind `RateLimitPort`, keeping this core unit-testable.
 */

export interface BucketState {
  /** Tokens currently available (fractional during refill). */
  tokens: number;
  /** Epoch ms of the last refill/consume. */
  updatedAt: number;
}

export interface RateLimitOptions {
  /** Maximum tokens the bucket holds (burst size). Default 30. */
  capacity?: number;
  /** Tokens regenerated per second (steady-state rate). Default 5. */
  refillPerSec?: number;
}

const DEFAULTS: Required<RateLimitOptions> = { capacity: 30, refillPerSec: 5 };

/** Thrown (mapped to `resource-exhausted`) when no token is available. */
export class RateLimitError extends FunctionsDomainError {
  constructor(
    public readonly key: string,
    public readonly retryAfterMs: number,
  ) {
    super('resource-exhausted', `Rate limit exceeded for '${key}'`);
    this.name = 'RateLimitError';
  }
}

/**
 * Pure refill: given the prior state (or `null` for a fresh bucket) and `now`,
 * compute the available token count, clamped to `[0, capacity]`. A bucket with
 * no prior state starts full.
 */
export function refill(
  prior: BucketState | null,
  now: number,
  opts: Required<RateLimitOptions>,
): number {
  if (!prior) return opts.capacity;
  const elapsedSec = Math.max(0, (now - prior.updatedAt) / 1000);
  const regenerated = elapsedSec * opts.refillPerSec;
  return Math.min(opts.capacity, prior.tokens + regenerated);
}

/**
 * Take a single token for `key`. Resolves when a token was consumed; throws a
 * `RateLimitError` (`resource-exhausted`) when the bucket is empty.
 *
 * `now` is injectable for deterministic tests; defaults to `Date.now()`.
 */
export async function takeToken(
  port: RateLimitPort,
  key: string,
  options: RateLimitOptions = {},
  now: number = Date.now(),
): Promise<void> {
  const opts = { ...DEFAULTS, ...options };

  await port.runBucketTransaction(key, (prior) => {
    const available = refill(prior, now, opts);
    if (available < 1) {
      // How long until one token regenerates.
      const retryAfterMs = Math.ceil(((1 - available) / opts.refillPerSec) * 1000);
      throw new RateLimitError(key, retryAfterMs);
    }
    return { tokens: available - 1, updatedAt: now };
  });
}

/**
 * A permissive no-op limiter, used as the default in callable cores and in
 * tests so existing specs (which don't provision a bucket) keep passing.
 */
export const noopRateLimit = {
  async take(): Promise<void> {
    /* always allowed */
  },
};

export interface RateLimit {
  take(actorUid: string): Promise<void>;
}

/** Build a real limiter from a port (used in main.ts wiring). */
export function createRateLimit(port: RateLimitPort, options?: RateLimitOptions): RateLimit {
  return {
    take: (actorUid: string) => takeToken(port, actorUid, options),
  };
}
