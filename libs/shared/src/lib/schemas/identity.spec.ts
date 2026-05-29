import { customClaims } from './identity';

describe('customClaims schema', () => {
  it('accepts a superadmin without a tenantId', () => {
    const parsed = customClaims.parse({ role: 'superadmin' });
    expect(parsed.entitlements).toEqual([]);
  });

  it('requires a tenantId for tenant-scoped roles', () => {
    expect(() => customClaims.parse({ role: 'learner' })).toThrow();
    expect(customClaims.parse({ role: 'learner', tenantId: 'acme' }).tenantId).toBe('acme');
  });

  it('rejects invalid roles', () => {
    expect(() => customClaims.parse({ role: 'wizard', tenantId: 'acme' })).toThrow();
  });
});
