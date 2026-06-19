import { isTransientError, withRetry } from './retry';

/** Never actually wait in tests. */
const noSleep = async (): Promise<void> => undefined;
/** Deterministic jitter. */
const fixedRandom = (): number => 0.5;

describe('isTransientError', () => {
  it('classifies string status codes as transient', () => {
    expect(isTransientError({ code: 'unavailable' })).toBe(true);
    expect(isTransientError({ code: 'DEADLINE_EXCEEDED' })).toBe(true);
    expect(isTransientError({ code: 'too-many-requests' })).toBe(true);
    expect(isTransientError({ code: 'aborted' })).toBe(true);
  });

  it('classifies numeric gRPC codes as transient', () => {
    expect(isTransientError({ code: 14 })).toBe(true); // UNAVAILABLE
    expect(isTransientError({ code: 4 })).toBe(true); // DEADLINE_EXCEEDED
    expect(isTransientError({ code: 10 })).toBe(true); // ABORTED
  });

  it('classifies HTTP 429/503/504 as transient', () => {
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 504 })).toBe(true);
  });

  it('classifies common network errnos as transient', () => {
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('treats permanent errors and non-objects as non-transient', () => {
    expect(isTransientError({ code: 'permission-denied' })).toBe(false);
    expect(isTransientError({ code: 'not-found' })).toBe(false);
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError('nope')).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the value on first success without retrying', async () => {
    const fn = jest.fn(async () => 'ok');
    await expect(withRetry(fn, { sleep: noSleep, random: fixedRandom })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures up to the limit then succeeds', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) throw { code: 'unavailable' };
      return 'recovered';
    });
    await expect(withRetry(fn, { retries: 3, sleep: noSleep, random: fixedRandom })).resolves.toBe(
      'recovered',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows the last error when all attempts fail', async () => {
    const fn = jest.fn(async () => {
      throw { code: 'unavailable', message: 'still down' };
    });
    await expect(
      withRetry(fn, { retries: 3, sleep: noSleep, random: fixedRandom }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-transient error', async () => {
    const fn = jest.fn(async () => {
      throw { code: 'permission-denied' };
    });
    await expect(
      withRetry(fn, { retries: 5, sleep: noSleep, random: fixedRandom }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors a custom isTransient classifier', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 2) throw new Error('flaky');
      return 'ok';
    });
    await expect(
      withRetry(fn, {
        retries: 3,
        sleep: noSleep,
        random: fixedRandom,
        isTransient: () => true,
      }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('backs off with a jittered delay bounded by the cap', async () => {
    const delays: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      delays.push(ms);
    };
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 4) throw { code: 'unavailable' };
      return 'ok';
    };
    await withRetry(fn, {
      retries: 4,
      baseDelayMs: 100,
      maxDelayMs: 250,
      sleep,
      random: () => 1, // worst-case jitter → equals the ceiling (minus 1 from floor)
    });
    // ceilings: 100, 200, min(250,400)=250 → floor(1*ceiling) but random<1 so use 0.999
    expect(delays).toHaveLength(3);
    expect(Math.max(...delays)).toBeLessThanOrEqual(250);
  });
});
