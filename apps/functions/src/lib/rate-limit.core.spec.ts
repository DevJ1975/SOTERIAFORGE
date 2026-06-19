import { FakeRateLimitPort } from './fakes';
import { refill, takeToken, RateLimitError, type BucketState } from './rate-limit.core';

const opts = { capacity: 3, refillPerSec: 1 };

describe('refill (pure)', () => {
  it('starts a fresh bucket at capacity', () => {
    expect(refill(null, 1000, opts)).toBe(3);
  });

  it('regenerates tokens by elapsed time, capped at capacity', () => {
    const prior: BucketState = { tokens: 0, updatedAt: 0 };
    expect(refill(prior, 2000, opts)).toBe(2); // 2s * 1/s
    expect(refill(prior, 10_000, opts)).toBe(3); // capped
  });

  it('never goes below the prior token count for zero elapsed time', () => {
    const prior: BucketState = { tokens: 1.5, updatedAt: 5000 };
    expect(refill(prior, 5000, opts)).toBe(1.5);
  });

  it('ignores clock skew (negative elapsed) without losing tokens', () => {
    const prior: BucketState = { tokens: 2, updatedAt: 5000 };
    expect(refill(prior, 4000, opts)).toBe(2);
  });
});

describe('takeToken', () => {
  it('consumes tokens from a fresh (full) bucket', async () => {
    const port = new FakeRateLimitPort();
    await takeToken(port, 'u1', opts, 1000);
    expect(port.buckets.get('u1')).toEqual({ tokens: 2, updatedAt: 1000 });
  });

  it('throws resource-exhausted when the bucket is empty', async () => {
    const port = new FakeRateLimitPort();
    // drain all 3 tokens at the same instant
    await takeToken(port, 'u1', opts, 1000);
    await takeToken(port, 'u1', opts, 1000);
    await takeToken(port, 'u1', opts, 1000);
    await expect(takeToken(port, 'u1', opts, 1000)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });

  it('rejects with a RateLimitError carrying a retryAfterMs hint', async () => {
    const port = new FakeRateLimitPort();
    port.buckets.set('u1', { tokens: 0, updatedAt: 1000 });
    const err = await takeToken(port, 'u1', opts, 1000).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterMs).toBe(1000); // 1 token / 1 per sec → 1000ms
    expect(err.key).toBe('u1');
  });

  it('allows again after enough time passes to refill', async () => {
    const port = new FakeRateLimitPort();
    port.buckets.set('u1', { tokens: 0, updatedAt: 1000 });
    await expect(takeToken(port, 'u1', opts, 1000)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    // 2 seconds later → 2 tokens regenerated, one consumed
    await takeToken(port, 'u1', opts, 3000);
    expect(port.buckets.get('u1')).toEqual({ tokens: 1, updatedAt: 3000 });
  });

  it('keys buckets independently per actor', async () => {
    const port = new FakeRateLimitPort();
    await takeToken(port, 'u1', opts, 1000);
    await takeToken(port, 'u2', opts, 1000);
    expect(port.buckets.get('u1')?.tokens).toBe(2);
    expect(port.buckets.get('u2')?.tokens).toBe(2);
  });

  it('does not consume a token when the bucket is empty (state unchanged)', async () => {
    const port = new FakeRateLimitPort();
    port.buckets.set('u1', { tokens: 0, updatedAt: 1000 });
    await takeToken(port, 'u1', opts, 1000).catch(() => undefined);
    expect(port.buckets.get('u1')).toEqual({ tokens: 0, updatedAt: 1000 });
  });
});
