import { buildBadgeAward, buildBadgeCredential } from './badge-credential';
import { FakeGamificationDbPort } from './fakes';
import { createVerifyBadgeHandler, verifyBadgeCore } from './verify-badge.core';
import type { VerifyBadgeResponse } from './verify-badge.core';

const NOW = '2026-06-11T12:00:00.000Z';

function makeDb(): FakeGamificationDbPort {
  const db = new FakeGamificationDbPort();
  db.awards.set(
    'acme/learner-1/first-steps',
    buildBadgeAward('acme', 'learner-1', 'first-steps', NOW),
  );
  return db;
}

class FakeResponse implements VerifyBadgeResponse {
  readonly headers = new Map<string, string>();
  statusCode = 200;
  body: unknown;

  set(name: string, value: string): void {
    this.headers.set(name, value);
  }
  status(code: number): void {
    this.statusCode = code;
  }
  json(body: unknown): void {
    this.body = body;
  }
}

describe('buildBadgeCredential / buildBadgeAward', () => {
  it('builds an OB 3.0 verifiable credential with the contract identifiers', () => {
    const credential = buildBadgeCredential('acme', 'learner-1', 'on-fire', NOW);
    expect(credential['type']).toEqual(['VerifiableCredential', 'OpenBadgeCredential']);
    expect(credential['id']).toBe('https://soteriaforge.com/badges/acme/learner-1/on-fire');
    expect(credential['issuer']).toMatchObject({
      id: 'https://soteriaforge.com/issuer/acme',
      type: 'Profile',
    });
    expect(credential['validFrom']).toBe(NOW);
    const subject = credential['credentialSubject'] as Record<string, unknown>;
    expect(subject['achievement']).toMatchObject({
      id: 'https://soteriaforge.com/achievements/on-fire',
      name: 'On Fire',
      criteria: { narrative: expect.stringContaining('seven') },
    });
    // Unsigned for now: proof arrives with production issuer keys.
    expect(credential['proof']).toBeUndefined();
  });

  it('builds the award doc shape stored under awards/{badgeId}', () => {
    const award = buildBadgeAward('acme', 'learner-1', 'first-steps', NOW);
    expect(award).toMatchObject({
      badgeId: 'first-steps',
      name: 'First Steps',
      earnedAt: NOW,
    });
    expect(award['credential']).toMatchObject({
      type: expect.arrayContaining(['OpenBadgeCredential']),
    });
  });
});

describe('verifyBadgeCore', () => {
  it('returns the stored credential for an earned badge', async () => {
    const db = makeDb();
    const result = await verifyBadgeCore(
      { db },
      { tenantId: 'acme', uid: 'learner-1', badgeId: 'first-steps' },
    );
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.name).toBe('First Steps');
      expect(result.earnedAt).toBe(NOW);
      expect(result.credential['id']).toBe(
        'https://soteriaforge.com/badges/acme/learner-1/first-steps',
      );
    }
  });

  it('reports not-found for unearned badges and unknown members', async () => {
    const db = makeDb();
    await expect(
      verifyBadgeCore({ db }, { tenantId: 'acme', uid: 'learner-1', badgeId: 'on-fire' }),
    ).resolves.toEqual({ found: false });
    await expect(
      verifyBadgeCore({ db }, { tenantId: 'acme', uid: 'ghost', badgeId: 'first-steps' }),
    ).resolves.toEqual({ found: false });
  });
});

describe('createVerifyBadgeHandler (GET /verifyBadge)', () => {
  const handler = (db: FakeGamificationDbPort) => createVerifyBadgeHandler({ db });

  it('serves an earned badge as JSON with long-lived cache headers', async () => {
    const res = new FakeResponse();
    await handler(makeDb())(
      { method: 'GET', query: { tenant: 'acme', uid: 'learner-1', badge: 'first-steps' } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('public');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
    expect(res.body).toMatchObject({ found: true, badgeId: 'first-steps' });
  });

  it('returns 404 with a short cache for unearned badges', async () => {
    const res = new FakeResponse();
    await handler(makeDb())(
      { method: 'GET', query: { tenant: 'acme', uid: 'learner-1', badge: 'on-fire' } },
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not-found' });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('returns 400 for missing or malformed query params', async () => {
    const res = new FakeResponse();
    await handler(makeDb())({ method: 'GET', query: { tenant: 'acme' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid-argument' });

    const badTenant = new FakeResponse();
    await handler(makeDb())(
      { method: 'GET', query: { tenant: 'NOT_A_TENANT', uid: 'u', badge: 'b' } },
      badTenant,
    );
    expect(badTenant.statusCode).toBe(400);
  });

  it('rejects non-GET methods with 405', async () => {
    const res = new FakeResponse();
    await handler(makeDb())(
      { method: 'POST', query: { tenant: 'acme', uid: 'learner-1', badge: 'first-steps' } },
      res,
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
  });
});
