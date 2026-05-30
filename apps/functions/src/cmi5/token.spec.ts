import { type Cmi5TokenPayload, nowPlusSeconds, signToken, verifyToken } from './token';

const SECRET = 'test-signing-secret';

function payload(overrides: Partial<Cmi5TokenPayload> = {}): Cmi5TokenPayload {
  return {
    t: 'acme',
    u: 'u-1',
    r: 'reg-1',
    a: 'https://soteriaforge.com/activity/1',
    k: 'fetch',
    exp: nowPlusSeconds(300),
    ...overrides,
  };
}

describe('cmi5 token sign/verify', () => {
  it('round-trips a valid token', () => {
    const p = payload();
    const verified = verifyToken(signToken(p, SECRET), SECRET);
    expect(verified).toEqual(p);
  });

  it('rejects a token signed with a different secret (tamper/forgery)', () => {
    const token = signToken(payload(), SECRET);
    expect(verifyToken(token, 'other-secret')).toBeNull();
  });

  it('rejects a token with a tampered body', () => {
    const token = signToken(payload({ t: 'acme' }), SECRET);
    const [body, sig] = token.split('.');
    // Flip the tenant by re-encoding a different body but keeping the old sig.
    const forged = `${Buffer.from(JSON.stringify(payload({ t: 'evil' })))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.${sig}`;
    expect(verifyToken(forged, SECRET)).toBeNull();
    expect(body).toBeTruthy();
  });

  it('rejects an expired token', () => {
    const token = signToken(payload({ exp: nowPlusSeconds(-10) }), SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyToken('garbage', SECRET)).toBeNull();
    expect(verifyToken('a.b.c', SECRET)).toBeNull();
  });

  it('preserves the kind field (fetch vs auth)', () => {
    expect(verifyToken(signToken(payload({ k: 'auth' }), SECRET), SECRET)?.k).toBe('auth');
  });
});
