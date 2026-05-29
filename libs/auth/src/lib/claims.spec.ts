import type { CustomClaims } from '@forge/shared';
import { canAccessTenant, canAuthor, hasRole, isSuperadmin, parseClaims } from './claims';

const admin: CustomClaims = { role: 'tenant_admin', tenantId: 'acme', entitlements: [] };
const superadmin: CustomClaims = { role: 'superadmin', entitlements: [] };
const learner: CustomClaims = { role: 'learner', tenantId: 'acme', entitlements: [] };

describe('claims helpers', () => {
  it('parses valid claims and rejects invalid', () => {
    expect(parseClaims({ role: 'learner', tenantId: 'acme' })).not.toBeNull();
    expect(parseClaims({ role: 'nope' })).toBeNull();
    expect(parseClaims({ role: 'learner' })).toBeNull(); // missing tenantId
  });

  it('identifies superadmin', () => {
    expect(isSuperadmin(superadmin)).toBe(true);
    expect(isSuperadmin(admin)).toBe(false);
  });

  it('checks roles', () => {
    expect(hasRole(admin, 'tenant_admin')).toBe(true);
    expect(hasRole(learner, 'tenant_admin')).toBe(false);
  });

  it('authoring roles', () => {
    expect(canAuthor(admin)).toBe(true);
    expect(canAuthor(learner)).toBe(false);
  });

  it('tenant access: superadmin anywhere, others only own tenant', () => {
    expect(canAccessTenant(superadmin, 'acme')).toBe(true);
    expect(canAccessTenant(superadmin, 'other')).toBe(true);
    expect(canAccessTenant(admin, 'acme')).toBe(true);
    expect(canAccessTenant(admin, 'other')).toBe(false);
    expect(canAccessTenant(null, 'acme')).toBe(false);
  });
});
