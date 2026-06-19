import { backoff, deviceId, isRetryable, staggerDelayMs, withRetry } from './stagger';

describe('deviceId', () => {
  it('returns a stable, non-empty id across calls (no-window env)', () => {
    const a = deviceId();
    const b = deviceId();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });
});

describe('staggerDelayMs', () => {
  it('is deterministic for the same input', () => {
    expect(staggerDelayMs('device-xyz', 10_000)).toBe(staggerDelayMs('device-xyz', 10_000));
  });

  it('stays within [0, windowMs)', () => {
    for (const id of ['a', 'device-1', 'device-2', 'zzzzzzzz', '🔥unicode']) {
      const d = staggerDelayMs(id, 5_000);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(5_000);
    }
  });

  it('spreads different ids across the window', () => {
    const values = new Set(
      ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id) => staggerDelayMs(id, 100_000)),
    );
    expect(values.size).toBeGreaterThan(1);
  });

  it('returns 0 for a non-positive window', () => {
    expect(staggerDelayMs('x', 0)).toBe(0);
    expect(staggerDelayMs('x', -5)).toBe(0);
  });
});

describe('backoff', () => {
  it('applies full jitter within [0, capped exponential)', () => {
    const opts = { baseMs: 100, maxMs: 10_000 };
    for (let attempt = 0; attempt < 6; attempt++) {
      const ceiling = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
      for (let i = 0; i < 50; i++) {
        const d = backoff(attempt, opts);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(ceiling);
      }
    }
  });

  it('caps the exponential growth at maxMs (monotone cap)', () => {
    // random()=1 yields the ceiling-1 (floored); use random just under 1.
    const opts = { baseMs: 1_000, maxMs: 4_000, random: () => 0.999999 };
    const delays = [0, 1, 2, 3, 4, 5].map((a) => backoff(a, opts));
    // Once 1000*2^attempt exceeds 4000 the value plateaus.
    expect(delays[3]).toBe(delays[4]);
    expect(delays[4]).toBe(delays[5]);
    expect(delays[5]).toBeLessThan(4_000);
  });

  it('uses the injected random source', () => {
    expect(backoff(0, { baseMs: 1_000, random: () => 0 })).toBe(0);
    expect(backoff(0, { baseMs: 1_000, maxMs: 1_000, random: () => 0.5 })).toBe(500);
  });
});

describe('isRetryable', () => {
  it('matches retryable status codes', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ statusCode: 408 })).toBe(true);
    expect(isRetryable({ code: 429 })).toBe(true);
  });

  it('matches retryable string codes/messages', () => {
    expect(isRetryable({ code: 'unavailable' })).toBe(true);
    expect(isRetryable({ code: 'deadline-exceeded' })).toBe(true);
    expect(isRetryable(new Error('too-many-requests'))).toBe(true);
    expect(isRetryable('Request failed with status 429')).toBe(true);
  });

  it('rejects non-retryable errors', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ code: 'permission-denied' })).toBe(false);
    expect(isRetryable(new Error('boom'))).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('withRetry', () => {
  const noSleep = () => Promise.resolve();

  it('returns immediately on success without sleeping', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const sleep = jest.fn(noSleep);
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries retryable errors then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ code: 'unavailable' })
      .mockResolvedValue('done');
    const sleep = jest.fn(noSleep);
    await expect(withRetry(fn, { sleep, attempts: 5 })).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 400 });
    const sleep = jest.fn(noSleep);
    await expect(withRetry(fn, { sleep })).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('respects the max attempts and rethrows the last error', async () => {
    const fn = jest.fn().mockRejectedValue({ code: 'deadline-exceeded' });
    const sleep = jest.fn(noSleep);
    await expect(withRetry(fn, { sleep, attempts: 3 })).rejects.toEqual({
      code: 'deadline-exceeded',
    });
    expect(fn).toHaveBeenCalledTimes(3);
    // One sleep between each of the 3 attempts except the last.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
